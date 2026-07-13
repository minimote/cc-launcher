/**
 * @file 使用指定的 CC-Switch 供应商启动 Claude
 *
 * 从 cc-switch 数据库读取指定名称的供应商配置
 * 提取环境变量，写到 settings_xxx.json
 * 然后启动 claude --settings <file>
 *
 * 用法:
 *   node cc-launcher.mjs [供应商名称]
 */

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** 目标 CLI 类型 */
const APP_TYPE = "claude";
/** cc-switch 数据目录 */
const CC_SWITCH_DIR = join(homedir(), ".cc-switch");
/** cc-switch 数据库路径 */
const DB_PATH = join(CC_SWITCH_DIR, "cc-switch.db");
/** settings 文件存放目录（脚本同级的 settings/） */
const SETTINGS_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    "settings",
);

/** 不允许被覆盖的系统环境变量 */
const BLOCKED_ENV_KEYS = new Set([
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
    "PATHEXT",
]);

/** DatabaseSync 构造器，首次调用 openDb 时动态加载 */
let DatabaseSync;

/**
 * 打开 cc-switch.db
 *
 * 首次调用时动态加载 node:sqlite（加载前屏蔽实验性警告）
 *
 * @returns {Promise<DatabaseSync>}
 */
async function openDb() {
    if (!DatabaseSync) {
        const restore = suppressExperimentalWarning();
        DatabaseSync = (await import("node:sqlite")).DatabaseSync;
        restore();
    }
    try {
        return new DatabaseSync(DB_PATH, { readOnly: true });
    } catch (err) {
        exitWithPause(
            `错误：无法打开数据库 ${DB_PATH}\n${
                err?.message || "数据库可能已损坏"
            }`,
        );
    }
}

/** 输出错误信息后等待按键再退出，避免窗口闪退 */
function exitWithPause(...args) {
    console.error(...args);
    execSync("pause", { stdio: "inherit" });
    process.exit(1);
}

/**
 * 交互式选择：上下键切换，回车确认
 * @param {string[]} items - 选项列表
 * @param {string} prompt - 提示文字
 * @returns {Promise<number>} 选中的选项索引
 */
function interactiveSelect(items, prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        exitWithPause("错误：交互选择需要终端（TTY）");
    }

    const hint = "（上下键切换，回车键确认）：";
    return new Promise((resolve) => {
        let cursor = 0;

        function render() {
            console.log(prompt + hint);
            for (let i = 0; i < items.length; i++) {
                if (i === cursor) {
                    console.log(`\x1b[7m> ${items[i]}\x1b[0m`);
                } else {
                    console.log(`  ${items[i]}`);
                }
            }
        }

        // 先输出再移到顶部，为后续重绘做准备
        const totalLines = items.length + 1;

        process.stdin.setRawMode(true);
        process.stdin.resume();
        render();

        process.stdin.on("data", function handler(chunk) {
            const key = chunk.toString();

            if (key === "\x1b[A" && cursor > 0) {
                cursor--;
            } else if (key === "\x1b[B" && cursor < items.length - 1) {
                cursor++;
            } else if (chunk[0] === 0x0d || chunk[0] === 0x0a) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener("data", handler);
                process.stdout.write("\n");
                resolve(cursor);
                return;
            } else if (key === "\x03") {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.exit(130);
            }

            // 回到顶部，清除，重绘
            process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
            render();
        });
    });
}

/** 屏蔽 node:sqlite 的实验性警告 */
function suppressExperimentalWarning() {
    const original = process.emitWarning;
    process.emitWarning = function (...args) {
        const type = typeof args[1] === "string" ? args[1] : args[1]?.type;
        if (type === "ExperimentalWarning") {
            return;
        }
        return original.apply(this, args);
    };
    return () => {
        process.emitWarning = original;
    };
}

/** 检查 cc-switch 数据库是否存在 */
function checkDatabase() {
    if (!existsSync(DB_PATH)) {
        exitWithPause(
            `错误： cc-switch 数据库不存在：${DB_PATH}\n请确认已安装并运行过 cc-switch 桌面版`,
        );
    }
}

/**
 * 查询所有 claude 供应商，让用户交互选择，返回选中的名称
 * @param {string} [prompt] - 提示文字
 * @returns {Promise<string>}
 */
async function pickProvider(prompt) {
    const db = await openDb();
    const items = db
        .prepare(
            "SELECT name FROM providers WHERE app_type = ? " +
                "ORDER BY sort_index, name",
        )
        .all(APP_TYPE);

    if (items.length === 0) {
        db.close();
        exitWithPause("没有可用的供应商");
    }

    try {
        const idx = await interactiveSelect(
            items.map((r) => r.name),
            prompt || "未指定供应商，请选择",
        );
        return items[idx].name;
    } finally {
        db.close();
    }
}

/**
 * 查询并解析供应商，交互式处理未找到 / 多个匹配的情况
 * @param {string} name - 供应商名称
 * @returns {Promise<object>} 供应商行
 */
async function resolveProvider(name) {
    let retries = 0;
    const MAX_RETRIES = 3;
    while (retries < MAX_RETRIES) {
        retries++;
        const db = await openDb();
        try {
            const rows = db
                .prepare(
                    `SELECT id, app_type, name, settings_config, is_current
                     FROM providers
                     WHERE name = ? AND app_type = ?`,
                )
                .all(name, APP_TYPE);

            if (rows.length === 1) {
                return rows[0];
            }

            if (rows.length > 1) {
                const labels = rows.map(
                    (r) =>
                        `${r.name} (${r.app_type}${r.is_current ? ", 当前激活" : ""})`,
                );
                const idx = await interactiveSelect(
                    labels,
                    "找到多个同名项，请选择",
                );
                return rows[idx];
            }

            name = await pickProvider(`未找到 "${name}"，请选择其他供应商`);
        } finally {
            db.close();
        }
    }
    exitWithPause(`错误：多次尝试后仍未匹配到供应商 "${name}"`);
}

/**
 * 解析供应商配置，提取 env 变量
 * @param {string} settingsConfig - JSON 字符串
 * @returns {object} envVars
 */
function parseProviderConfig(settingsConfig) {
    let config;
    try {
        config = JSON.parse(settingsConfig);
    } catch {
        exitWithPause("错误：解析供应商配置 JSON 失败");
    }

    const envVars = {};
    if (config?.env && typeof config.env === "object") {
        for (const [key, value] of Object.entries(config.env)) {
            if (BLOCKED_ENV_KEYS.has(key)) {
                console.warn(
                    `警告：环境变量 "${key}" 为系统关键变量，已跳过（防止覆盖系统设置）`,
                );
                continue;
            }
            if (typeof value === "string") {
                envVars[key] = value;
            } else if (value !== null && value !== undefined) {
                console.warn(
                    `警告：环境变量 "${key}" 的类型为 ${typeof value}，仅支持字符串，已跳过`,
                );
            }
        }
    }
    return envVars;
}

/**
 * 写临时 settings 文件
 * @param {string} providerId
 * @param {object} envVars
 * @returns {string} 文件路径
 */
function writeSettingsFile(providerId, envVars) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    const file = join(SETTINGS_DIR, `settings_${providerId}.json`);
    const content = { env: envVars };
    writeFileSync(file, JSON.stringify(content, null, 2), "utf-8");
    return file;
}

/**
 * 启动 claude 并等待退出
 * @param {string} settingsFile
 * @param {string} providerName
 */
function startClaude(settingsFile, providerName) {
    console.log("");
    console.log(`Using [${providerName}]`);
    console.log("Starting Claude...\n");

    const extraArgs = process.argv.slice(3).join(" ");
    const cmd = `claude --settings "${settingsFile}"${extraArgs ? " " + extraArgs : ""}`;
    const child = spawn(cmd, {
        stdio: "inherit",
        env: process.env,
        shell: true,
    });

    const cleanupAndExit = (code = 0) => {
        try {
            process.stdin.setRawMode(false);
        } catch {}
        process.exit(code);
    };

    child.on("exit", (code, signal) =>
        cleanupAndExit(signal ? 1 : (code ?? 0)),
    );
    child.on("error", (err) => {
        console.error("启动 claude 失败:", err.message);
        exitWithPause(err.message);
    });

    process.on("SIGINT", () => cleanupAndExit(130));
    process.on("SIGTERM", () => cleanupAndExit(143));
}

async function main() {
    // 供应商名称
    let PROVIDER_NAME = process.argv[2];

    // 检查数据库
    checkDatabase();

    // 未传供应商名称时交互选择
    if (!PROVIDER_NAME) {
        PROVIDER_NAME = await pickProvider();
    }

    // 循环直到找到唯一供应商
    const provider = await resolveProvider(PROVIDER_NAME);

    // 解析配置
    const envVars = parseProviderConfig(provider.settings_config);

    // 写临时 settings 文件
    const settingsFile = writeSettingsFile(provider.id, envVars);

    // 启动 CLI
    startClaude(settingsFile, provider.name);
}

main().catch((err) => {
    exitWithPause("启动失败：" + (err?.message ?? err ?? "未知错误"));
});
