/**
 * @file 使用指定的 CC-Switch 供应商启动 Claude Code
 *
 * 从 cc-switch 数据库读取指定名称的供应商配置，生成独立 settings 文件，通过 `claude --settings <file>` 启动，实现实例级隔离（详见 README 工作原理）
 *
 * 用法:
 *   node cc-launcher.mjs [供应商名称(可为空)] [Claude Code 额外参数...]
 *
 */

import { homedir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** 目标 CLI 类型 */
const APP_TYPE = "claude";
/** cc-switch 数据目录 */
const CC_SWITCH_DIR = join(homedir(), ".cc-switch");
/** cc-switch 数据库路径 */
const DB_PATH = join(CC_SWITCH_DIR, "cc-switch.db");
/** settings 文件存放目录（脚本同级的 settings/） */
const SETTINGS_DIR = join(dirname(fileURLToPath(import.meta.url)), "settings");
/** 全局 Claude Code settings 路径（cc-switch 写入，其 env 会泄漏到本实例） */
const GLOBAL_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

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
        exitWithPause(`错误：无法打开数据库 ${DB_PATH}\n${err?.message}`);
    }
}

/** 输出错误信息后等待按键再退出，避免窗口闪退 */
function exitWithPause(...args) {
    console.error(...args);
    execSync("pause", { stdio: "inherit" });
    process.exit(1);
}

/**
 * 交互式选择：上下键切换，回车确认，Esc 或 Ctrl+C 退出
 * @param {string[]} items - 选项列表
 * @param {string} prompt - 提示文字
 * @returns {Promise<number>} 选中的选项索引
 */
function interactiveSelect(items, prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        exitWithPause("错误：交互选择需要在终端运行");
    }

    const hint = " (回车确认):";
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

        // 提示行 + 选项行的总行数，redraw 时据此上移光标回到起始位置
        const totalLines = items.length + 1;

        process.stdin.setRawMode(true);
        process.stdin.resume();
        render();

        // raw mode 下按键以字节序列传入：方向键是 \x1b[A / \x1b[B 等 3 字节转义序列，普通键 1 字节
        // 终端可能把转义序列拆成多次传入（先 \x1b 再 [A），单独的 \x1b 用短延时等待后续字节，
        // 以区分 Esc（无后续）与方向键（后续为 [ 开头的序列）
        let escapeTimer = null;

        function redraw() {
            // 光标上移 totalLines 行、清除到屏幕末尾，随后重绘
            process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
            render();
        }

        function exitSelect() {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            // 130 = 被 Ctrl+C 终止的约定退出码
            process.exit(130);
        }

        process.stdin.on("data", function handler(chunk) {
            // 有待处理的 \x1b：本次以 [ 或 O 开头则合并为完整转义序列，否则视为 Esc
            if (escapeTimer) {
                clearTimeout(escapeTimer);
                escapeTimer = null;
                const next = chunk.toString();
                if (next[0] === "[" || next[0] === "O") {
                    chunk = Buffer.concat([Buffer.from([0x1b]), chunk]);
                } else {
                    exitSelect();
                    return;
                }
            }

            const key = chunk.toString();

            // 回车（CR / LF）确认
            if (chunk[0] === 0x0d || chunk[0] === 0x0a) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener("data", handler);
                process.stdout.write("\n");
                resolve(cursor);
                return;
            }

            // 单独的 \x1b：可能是 Esc，也可能是被拆分的转义序列首字节，等待短延时判定
            if (chunk.length === 1 && chunk[0] === 0x1b) {
                escapeTimer = setTimeout(() => {
                    escapeTimer = null;
                    exitSelect();
                }, 50);
                return;
            }

            // 上方向键
            if (key === "\x1b[A") {
                cursor = (cursor - 1 + items.length) % items.length;
            } else if (key === "\x1b[B") {
                // 下方向键
                cursor = (cursor + 1) % items.length;
            } else if (key === "\x03") {
                // Ctrl+C 退出
                exitSelect();
                return;
            } else {
                // 未识别按键，不重绘
                return;
            }

            redraw();
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
        exitWithPause(`错误：cc-switch 数据库不存在：${DB_PATH}`);
    }
}

/**
 * 从 meta JSON 解析 apiFormat，解析失败或缺失返回 null
 * @param {string} meta - providers.meta 列的 JSON 字符串
 * @returns {string | null}
 */
function getApiFormat(meta) {
    try {
        return JSON.parse(meta)?.apiFormat ?? null;
    } catch {
        return null;
    }
}

/**
 * 查询所有 Anthropic Messages 协议的 claude 供应商，让用户交互选择，返回选中的供应商行
 * @param {DatabaseSync} db - 已打开的数据库连接
 * @param {string} [prompt] - 提示文字
 * @returns {Promise<object>} 供应商行
 */
async function pickProvider(db, prompt) {
    const all = db
        .prepare(
            "SELECT id, name, settings_config, meta, is_current FROM providers WHERE app_type = ? " +
                "ORDER BY sort_index, name",
        )
        .all(APP_TYPE);

    // 仅 Anthropic Messages 协议可直接通过 --settings 启动
    const items = all.filter((r) => {
        return getApiFormat(r.meta) === "anthropic";
    });

    if (items.length === 0) {
        exitWithPause("没有可用的 Anthropic Messages 协议供应商");
    }

    const idx = await interactiveSelect(
        items.map((r) => {
            return `${r.name}${r.is_current ? " (当前全局激活)" : ""}`;
        }),
        prompt || "未指定，请从可用供应商中选择",
    );
    return items[idx];
}

/**
 * 按名称查找供应商，交互式处理未找到 / 多个匹配 / 协议不兼容的情况
 * @param {DatabaseSync} db - 已打开的数据库连接
 * @param {string} name - 供应商名称
 * @returns {Promise<object>} 供应商行
 */
async function resolveProvider(db, name) {
    const rows = db
        .prepare(
            `SELECT id, app_type, name, settings_config, is_current, meta
             FROM providers
             WHERE name = ? AND app_type = ?`,
        )
        .all(name, APP_TYPE);

    let selected = null;
    if (rows.length === 1) {
        selected = rows[0];
    } else if (rows.length > 1) {
        const labels = rows.map((r) => {
            const tags = [];
            if (r.is_current) {
                tags.push("当前全局激活");
            }
            if (getApiFormat(r.meta) !== "anthropic") {
                tags.push("非 Anthropic 协议");
            }
            return `${r.name}${tags.length ? ` (${tags.join(", ")})` : ""}`;
        });
        const idx = await interactiveSelect(labels, "找到多个同名项，请选择");
        selected = rows[idx];
    }

    if (selected) {
        if (getApiFormat(selected.meta) !== "anthropic") {
            return pickProvider(
                db,
                `"${selected.name}" 不支持原生 Anthropic Messages 协议，请选择其他供应商`,
            );
        }
        return selected;
    }

    // 未找到
    return pickProvider(db, `未找到 "${name}"，请选择其他供应商`);
}

/**
 * 解析供应商配置，返回完整 settings 对象
 * @param {string} settingsConfig - JSON 字符串
 * @returns {object} 完整 settings 对象
 */
function parseProviderSettings(settingsConfig) {
    let config;
    try {
        config = JSON.parse(settingsConfig);
    } catch {
        exitWithPause("错误：解析供应商配置 JSON 失败");
    }
    return config;
}

/**
 * 取全局 ~/.claude/settings.json 的 env 对象（原样，不过滤）
 *
 * 这是真实泄漏到本实例的源：cc-switch 切换供应商时把激活供应商的 settings_config
 * 写入此文件，Claude Code 启动时会合并其 env。直接读它做中和，比从 DB is_current 行
 * 推断更可靠——用户手改此文件、切换残留或 cc-switch 未及时写入时，DB 与文件可能不同步，
 * 用 DB 会漏掉文件里多出的 key（不被置空 → 以全局旧值泄漏进目标实例）
 *
 * @returns {object|null} env 对象；文件不存在/解析失败/无 env 时返回 null
 */
function getGlobalSettingsEnv() {
    let cfg;
    try {
        cfg = JSON.parse(readFileSync(GLOBAL_SETTINGS_PATH, "utf-8"));
    } catch {
        return null;
    }
    if (!cfg.env || typeof cfg.env !== "object") return null;
    return cfg.env;
}

/**
 * 构造隔离后的 env：先把全局 settings.json 的 env key 全置空（抵消全局泄漏），
 * 再用目标供应商的 env 覆盖，最后统一过滤系统关键变量与非字符串值
 *
 * env key 设为 "" 时，ClaudeCode 会视为未设置，而不会回退到全局的值
 *
 * 非字符串值置空为 "" 而非删除，避免该 key 回退到全局 settings.json 的泄漏值
 * @param {object} globalEnv - 全局 ~/.claude/settings.json 的 env（原样）
 * @param {object} targetEnv - 目标供应商的 env（原样）
 * @returns {object} 合成后的 env 对象
 */
function buildIsolatedEnv(globalEnv, targetEnv) {
    const result = {};
    // 全局 settings.json 的 env key 全置空，抵消全局泄漏
    if (globalEnv) {
        for (const k of Object.keys(globalEnv)) {
            result[k] = "";
        }
    }
    // 目标供应商 env 覆盖真实值
    if (targetEnv && typeof targetEnv === "object") {
        for (const [k, v] of Object.entries(targetEnv)) {
            result[k] = v;
        }
    }
    // 统一过滤：系统关键变量删除，非字符串值置空为 ""（保留隔离）
    // 系统关键变量用 delete 而非置空：PATH 等置为 "" 会让 Claude Code spawn 的子进程
    // （git/node/bash 等）全部 ENOENT 而失能；delete 使其不写入 settings，Claude Code
    // 回退到全局/shell 的值，至少保证有 PATH 可用。保护这些 key 还能防止「激活供应商
    // 误配 PATH（常见：复制整条 PATH 想加目录却写成覆盖）经置空污染所有其他供应商实例」
    for (const key of Object.keys(result)) {
        if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) {
            console.warn(`警告：环境变量 "${key}" 为系统关键变量，已跳过`);
            delete result[key];
            continue;
        }
        if (typeof result[key] !== "string") {
            if (result[key] !== null && result[key] !== undefined) {
                console.warn(
                    `警告：环境变量 "${key}" 的类型为 ${typeof result[key]}，仅支持字符串，置空处理`,
                );
            }
            result[key] = "";
        }
    }
    return result;
}

/**
 * 把 provider id 清理成 Windows 文件名安全的形式
 * 原样拼进文件名时，含 / 会触发 ENOENT、含 : 会写入 NTFS 备用数据流，
 * 故把非法字符 \ / : * ? " < > | 一律替换为 _
 * @param {string} id
 * @returns {string}
 */
function sanitizeIdForFile(id) {
    return String(id).replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * 写运行时 settings 文件
 * @param {string} providerId
 * @param {object} settings - 完整 settings 对象
 * @returns {string} 文件路径
 */
function writeSettingsFile(providerId, settings) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    const file = join(
        SETTINGS_DIR,
        `settings_${sanitizeIdForFile(providerId)}.json`,
    );
    writeFileSync(file, JSON.stringify(settings, null, 2), "utf-8");
    return file;
}

/**
 * 按 PowerShell 单引号规则转义参数，便于把实际命令复制到 PowerShell 直接使用
 * 单引号内一切为字面量，内部单引号用 '' 转义；对 & | < > % " 等均安全
 * @param {string} arg
 * @returns {string}
 */
function shellQuote(arg) {
    return `'${String(arg).replace(/'/g, "''")}'`;
}

/**
 * 解析 claude 的底层可执行文件路径，绕开 cmd.exe 的参数重解析
 *
 * 直接 spawn cmd.exe /c claude 会让 cmd 重新解析整条命令行，
 * 导致参数里的 %VAR% 被展开、& | 被当作命令分隔符
 * 这里遍历 PATH 找到 claude.cmd（npm 全局 shim），再按 npm 全局安装的固定相对路径
 * 定位到真正的 claude.exe，直接 spawn 它，参数走 Node 标准 argv 解析
 *
 * 用 PATH 遍历而非 `where claude`：where.exe 在中文区域按 GBK 输出 stdout，
 * Node 按 UTF-8 解码会让含非 ASCII 字符的路径（如中文用户名）乱码、existsSync
 * 恒失败而静默回退 cmd.exe；PATH 环境变量在 Node 里是 Unicode 字符串，无此问题，
 * 且省去子进程开销（实测约 46ms -> 1ms）
 * 找不到时返回 null，调用方退回 cmd.exe 方式
 * @returns {string|null}
 */
function resolveClaudeExe() {
    try {
        const dirs = (process.env.PATH || "").split(delimiter);
        for (const dir of dirs) {
            if (!dir) continue;
            const cmdFile = join(dir, "claude.cmd");
            if (!existsSync(cmdFile)) continue;
            const exe = join(
                dir,
                "node_modules",
                "@anthropic-ai",
                "claude-code",
                "bin",
                "claude.exe",
            );
            if (existsSync(exe)) return exe;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 启动 claude 并等待退出
 * @param {string} settingsFile
 * @param {string} providerName
 * @param {string} providerId 供应商 id，注入子进程环境变量供外部脚本识别
 */
function startClaude(settingsFile, providerName, providerId) {
    console.log("");
    console.log(`Using [${providerName}]`);

    const extraArgs = process.argv.slice(3);
    const claudeArgs = ["--settings", settingsFile, ...extraArgs];
    const claudeExe = resolveClaudeExe();
    // 拼出实际调用的命令并打印，方便用户复制到 PowerShell 直接使用
    // 主分支: & + 单引号包裹 exe 路径，含空格也能整体作为命令名（裸写会被 PowerShell
    // 按空格拆成 "C:\Users\John" + "Doe\..." 而失败）；spawn 本身用 argv 数组不受影响
    // 回退分支: 走 cmd.exe /c claude，PowerShell 传参时会自动给含空格参数加引号，单引号
    // 被 PowerShell 剥离后 cmd 收到正确参数（实测 F:\test path 不被拆）
    const cmd = claudeExe
        ? ["&", shellQuote(claudeExe), ...claudeArgs.map(shellQuote)].join(" ")
        : ["cmd.exe", "/c", "claude", ...claudeArgs.map(shellQuote)].join(" ");
    console.log(`Command: \n${cmd}`);
    console.log("Starting Claude Code...\n");

    const env = { ...process.env, CC_SWITCH_PROVIDER_ID: providerId };
    const child = claudeExe
        ? spawn(claudeExe, claudeArgs, { stdio: "inherit", env })
        : spawn("cmd.exe", ["/c", "claude", ...claudeArgs], {
              stdio: "inherit",
              env,
          });
    if (!claudeExe) {
        console.warn(
            "警告：未定位到 claude.exe，回退到 cmd.exe 启动；参数若含 % 或 & | 等字符可能被 cmd 重解析破坏。",
        );
    }

    const cleanupAndExit = (code = 0) => {
        try {
            process.stdin.setRawMode(false);
        } catch {}
        process.exit(code);
    };

    child.on("exit", (code, signal) => {
        cleanupAndExit(signal ? 1 : (code ?? 0));
    });
    child.on("error", (err) => {
        exitWithPause(`启动 Claude Code 失败：${err.message}`);
    });

    process.on("SIGINT", () => {
        cleanupAndExit(130);
    });
    process.on("SIGTERM", () => {
        cleanupAndExit(143);
    });
}

async function main() {
    const PROVIDER_NAME = process.argv[2];

    // 检查数据库
    checkDatabase();

    // 打开数据库（整个选择流程复用同一个连接）
    const db = await openDb();
    // 取全局 settings.json 的 env，用于隔离全局泄漏（不依赖 db，先读）
    let globalEnv = getGlobalSettingsEnv();
    let provider;
    try {
        if (!PROVIDER_NAME) {
            // 未传供应商名称时交互选择，直接拿到供应商行
            provider = await pickProvider(db);
        } else {
            // 按名称查找
            provider = await resolveProvider(db, PROVIDER_NAME);
        }
    } finally {
        db.close();
    }

    // 解析配置（完整 settings 对象）
    const settings = parseProviderSettings(provider.settings_config);

    // 隔离 env：置空全局 settings.json 泄漏的变量，再用目标供应商覆盖，统一过滤
    // 非 env 的配置值无效时会被 ClaudeCode 丢弃，从而回退到全局配置，无法完整隔离
    settings.env = buildIsolatedEnv(globalEnv, settings.env);

    // 写运行时 settings 文件
    const settingsFile = writeSettingsFile(provider.id, settings);

    // 启动 CLI
    startClaude(settingsFile, provider.name, provider.id);
}

main().catch((err) => {
    exitWithPause("启动失败：" + (err?.message ?? err ?? "未知错误"));
});
