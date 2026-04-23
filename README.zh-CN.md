# ShortLink

[English](./README.md)

一个完全基于 Cloudflare 平台的自托管短链接服务。无需管理服务器 — 运行于 Workers、D1（SQLite）和 KV 之上。

## 功能特性

- **短链接** — 随机 4 字符 slug 或自定义别名
- **点击分析** — 通过 Cloudflare 地理位置头信息追踪国家、设备、浏览器、操作系统和来源
- **多用户** — 注册可开放或仅限邀请；第一个注册用户自动成为管理员
- **三种双因素认证** — TOTP（认证器应用）、Passkey（WebAuthn）、邮件 OTP
- **管理面板** — 管理用户、查看所有链接、配置全局设置
- **链接有效期** — 按日期或天数设置过期时间
- **零出口费用** — KV 缓存重定向查询；点击日志记录为非阻塞操作

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端 | TypeScript + Hono.js on Cloudflare Workers |
| 前端 | React 18 + Vite + shadcn/ui + Tailwind CSS |
| 数据库 | Cloudflare D1（SQLite） |
| 缓存 | Cloudflare KV |
| 邮件 | Resend API **或** 自定义 SMTP 服务器（可在管理界面切换） |
| 图表 | Recharts + react-simple-maps |
| 双因素认证 | otpauth（TOTP）+ @simplewebauthn/server（Passkey）+ 邮件 OTP |

## 部署

### 前置条件

- [Cloudflare 账户](https://dash.cloudflare.com)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npm install -g wrangler`）
- Node.js ≥ 20 且 pnpm ≥ 9

### 1. 克隆并安装依赖

```bash
git clone <repo>
cd shortlink
pnpm install
```

### 2. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
wrangler d1 create shortlink

# 创建 KV 命名空间
wrangler kv namespace create LINKS_KV
```

记下每条命令输出的 ID — 下一步将其添加为 GitHub Actions 密钥。

### 3. 添加 GitHub Actions 密钥

在你的 GitHub 仓库中前往 **Settings → Secrets and variables → Actions** 并添加：

| 密钥 | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 使用 **Edit Cloudflare Workers** 模板创建的 API 令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 你的账户 ID（可在 Cloudflare 控制台 URL 中找到） |
| `D1_DATABASE_ID` | `wrangler d1 create` 返回的 ID |
| `KV_NAMESPACE_ID` | `wrangler kv namespace create` 返回的 ID |

部署工作流（`.github/workflows/deploy.yml`）在部署时通过 `sed` 将这些 ID 注入 `wrangler.toml`，因此 ID 不会提交到仓库。

### 3. 配置变量和密钥

前往 [Cloudflare 控制台](https://dash.cloudflare.com) → **Workers & Pages → shortlink → Settings → Variables and Secrets** 并添加：

| 名称 | 类型 | 必填 | 示例 / 说明 |
|---|---|---|---|
| `APP_URL` | Variable | 是 | `https://yourdomain.com` |
| `APP_NAME` | Variable | 是 | `ShortLink` — 默认应用名称，可在管理界面覆盖 |
| `RP_ID` | Variable | 是 | `yourdomain.com` — WebAuthn 依赖方 ID（仅域名） |
| `APP_ORIGIN` | Variable | 是 | `https://yourdomain.com` — WebAuthn 来源（完整 URL） |
| `TABLE_PREFIX` | Variable | 否 | 例如 `sl` — 为所有 D1 表名添加前缀（`sl_users`、`sl_links` 等）。必须在运行 setup 路由**之前**设置。留空则使用无前缀名称。 |
| `JWT_SECRET` | Secret | 是 | 任意长度 ≥ 32 字符的随机字符串 |
| `TOTP_ENCRYPTION_KEY` | Secret | 是 | `openssl rand -hex 32` |
| `SETUP_SECRET` | Secret | 是 | `openssl rand -hex 24` — 用于触发迁移 |

> `wrangler.toml` 中设置了 `keep_vars = true`，因此部署不会覆盖这些值。
>
> 邮件提供商设置（Resend API 密钥、SMTP 凭据等）在首次登录后通过**管理界面**配置 — 无需在 Cloudflare 控制台中配置。

### 4. 运行数据库迁移

部署后，在浏览器中访问以下 URL 一次（或使用 `curl`）：

```
https://your-worker.workers.dev/setup/<SETUP_SECRET>
```

成功响应：
```json
{
  "migrations": [
    { "name": "schema_v1", "status": "applied" }
  ]
}
```

重复访问是安全的 — 已应用的迁移会返回 `"skipped"`。添加新迁移后再次运行即可。

### 5. 构建并部署

```bash
# 从仓库根目录
pnpm deploy
```

这将构建前端，然后将 Worker 与 SPA 一起作为静态资源部署。

### 6. 首次登录

访问已部署的 URL 并注册 — 第一个账户将自动获得管理员角色，无论 `registration_enabled` 设置如何。然后前往 **Admin → Settings** 配置你的邮件提供商。

---

## 本地开发

```bash
# 1. 创建 apps/worker/.dev.vars
cat > apps/worker/.dev.vars << 'EOF'
JWT_SECRET=dev-secret-at-least-32-characters-long
TOTP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
SETUP_SECRET=local-setup-secret
EOF

# 2. 将迁移应用到本地 D1
cd apps/worker && pnpm db:migrate:local && cd ../..

# 3. 启动所有服务
pnpm dev
# Worker: http://localhost:8787
# Web:    http://localhost:5173
```

Vite 开发服务器会自动将 `/api` 请求代理到 `:8787`。

---

## API 参考

### 认证

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/auth/register` | 注册新账户 |
| POST | `/api/auth/login` | 登录；返回令牌或双因素认证挑战 |
| POST | `/api/auth/logout` | 吊销刷新令牌 |
| POST | `/api/auth/refresh` | 刷新访问令牌 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/change-password` | 修改密码（需认证） |
| POST | `/api/auth/forgot-password` | 通过邮件请求密码重置码 |
| POST | `/api/auth/verify-reset-code` | 验证密码重置码（不消耗） |
| POST | `/api/auth/reset-password` | 使用重置码和新密码完成密码重置 |

### 双因素认证 — 验证（需要登录时返回的 `pendingToken`）

| 方法 | 路径 | 描述 |
|---|---|---|
| POST | `/api/auth/2fa/totp/verify` | 使用 TOTP 码完成登录 |
| POST | `/api/auth/2fa/email-otp/send` | 发送邮件 OTP |
| POST | `/api/auth/2fa/email-otp/verify` | 使用邮件 OTP 完成登录 |
| POST | `/api/auth/2fa/passkey/verify-options` | 获取 WebAuthn 断言选项 |
| POST | `/api/auth/2fa/passkey/verify` | 使用 Passkey 完成登录 |

### 双因素认证 — 设置（需要有效会话）

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/auth/2fa/totp/setup` | 获取 TOTP 密钥 + QR URI |
| POST | `/api/auth/2fa/totp/confirm` | 确认并启用 TOTP |
| DELETE | `/api/auth/2fa/totp` | 禁用 TOTP |
| POST | `/api/auth/2fa/email-otp/send-verify` | 发送验证码以启用邮件 OTP |
| POST | `/api/auth/2fa/email-otp/enable` | 启用邮件 OTP（需要验证码） |
| DELETE | `/api/auth/2fa/email-otp` | 禁用邮件 OTP |
| GET | `/api/auth/2fa/passkey` | 列出已注册的 Passkey |
| POST | `/api/auth/2fa/passkey/register-options` | 获取 WebAuthn 注册选项 |
| POST | `/api/auth/2fa/passkey/register-verify` | 注册 Passkey |
| DELETE | `/api/auth/2fa/passkey/:id` | 删除 Passkey |

### 链接（需要认证）

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/links` | 列出你的链接（分页、可搜索） |
| POST | `/api/links` | 创建链接 |
| GET | `/api/links/:id` | 获取链接详情 |
| PUT | `/api/links/:id` | 更新链接 |
| DELETE | `/api/links/:id` | 删除链接 |

### 分析（需要认证）

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/analytics/summary` | 所有用户链接的汇总点击统计（查询参数：`days=30`） |
| GET | `/api/analytics/:linkId` | 单条链接的点击分析 |

### 管理（需要管理员角色）

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/admin/stats` | 控制台统计数据 |
| GET | `/api/admin/users` | 列出所有用户 |
| POST | `/api/admin/users` | 创建用户（管理员操作） |
| PATCH | `/api/admin/users/:id` | 更新用户角色/状态 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET | `/api/admin/links` | 列出所有链接 |
| DELETE | `/api/admin/links/:id` | 删除任意链接 |
| GET | `/api/admin/settings` | 获取全局设置 |
| PUT | `/api/admin/settings` | 更新全局设置 |

### 其他

| 方法 | 路径 | 描述 |
|---|---|---|
| GET | `/api/config` | 公开应用配置（`appName`、`registrationEnabled`） |
| GET | `/api/health` | 健康检查 |

### 重定向

```
GET /:slug  →  302 跳转到目标 URL
```

---

## 环境变量

所有变量和密钥均在 **Cloudflare 控制台**（Workers & Pages → shortlink-worker → Settings → Variables and Secrets）中管理。`wrangler.toml` 中的 `keep_vars = true` 确保部署不会覆盖它们。

| 变量 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `APP_URL` | 变量 | 是 | 规范基础 URL（例如 `https://go.example.com`） |
| `APP_NAME` | 变量 | 是 | 默认应用名称；可在管理界面覆盖 |
| `RP_ID` | 变量 | 是 | WebAuthn 依赖方 ID（不含协议的域名） |
| `APP_ORIGIN` | 变量 | 是 | WebAuthn 来源（完整 URL） |
| `TABLE_PREFIX` | 变量 | 否 | 所有 D1 表名的前缀（例如 `sl` → `sl_users`、`sl_links` 等）。在第一次迁移前设置一次 — 之后更改需手动重命名所有表。只使用字母数字和下划线字符。 |
| `JWT_SECRET` | 密钥 | 是 | HS256 签名密钥，≥ 32 字符 |
| `TOTP_ENCRYPTION_KEY` | 密钥 | 是 | 来自 `openssl rand -hex 32` 的十六进制字符串 |
| `SETUP_SECRET` | 密钥 | 是 | 通过 HTTP 触发数据库迁移的密钥路径 |

---

## 设置（管理面板）

| 键 | 值 | 描述 |
|---|---|---|
| `registration_enabled` | `true` / `false` | 允许新用户注册（默认：`false`） |
| `app_name` | 字符串 | 覆盖显示的应用名称 |
| `email_provider` | `resend` / `smtp` | 使用哪个邮件后端（默认：`resend`） |
| `resend_api_key` | 字符串 | Resend API 密钥（覆盖 `RESEND_API_KEY` 环境变量） |
| `email_from_domain` | 域名 | Resend 的发件人域名，例如 `example.com`（覆盖环境变量） |
| `email_from_name` | 字符串 | Resend 的发件人显示名称（覆盖环境变量） |
| `smtp_host` | 主机名 | SMTP 服务器主机名 |
| `smtp_port` | `587` / `465` / … | SMTP 端口 — 465 为隐式 TLS，587 为 STARTTLS |
| `smtp_from` | 邮件地址 | 发件人地址，例如 `noreply@example.com` |
| `smtp_user` | 字符串 | SMTP 用户名（留空则使用未认证中继） |
| `smtp_pass` | 字符串 | SMTP 密码（存储在 D1 中） |

---

## 许可证

[MIT](./LICENSE)
