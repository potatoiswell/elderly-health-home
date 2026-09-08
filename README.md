# 老年人健康居家管理小程序（微信云开发 · 原生语法）

面向老年用户及其子女的健康居家管理小程序。前端全部使用微信小程序原生
`wxml/wxss/js/json`，后端全部使用云开发（云函数 + 云数据库 + 定时触发器），
无自建服务器。
演示视频：https://github.com/potatoiswell/elderly-health-home/issues/1
## 一、已交付内容

### 页面

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| Tab1 首页 | `pages/index/` | 日期、天气与出行建议、跌倒呼救、紧急呼救、2×2 快捷入口、今日状态、活动/饮食/就医入口 |
| Tab2 健康记录 | `pages/records/` | 血压/血糖记录、历史删除、Canvas 近 7 次趋势图 |
| Tab3 用药提醒 | `pages/medicines/` | 今日已服统计、添加药品、订阅授权、已服/未服/漏服 |
| Tab4 我的 | `pages/profile/` | 档案入口、紧急联系人、子女绑定码、数据导出 |
| 健康档案 | `pages/archive/` | 头像、姓名、年龄、病史、过敏药物、紧急联系人 |
| 跌倒/紧急 | 首页按钮 | `emergencyAlert` 云函数记录位置并通知已绑定子女 |
| 每日活动 | `pages/activity/` | 微信运动步数（cloudID 云调用）或手动步数/时长 |
| 饮食记录 | `pages/meals/` | 早/午/晚/加餐拍照上传云存储 + 备注 |
| 就医记录 | `pages/medical/` | 时间线：日期/医院/科室/诊断/建议 |
| 子女端 | `pages/family/` | 输入 6 位码绑定老人，只读查看健康汇总 |

### 云函数（共 7 个，均在 `cloudfunctions/`）

| 云函数 | 用途 |
| --- | --- |
| `login` | 获取 openid、自动建 users 档案、生成绑定码 |
| `saveBpRecord` | 血压/血糖记录服务端校验与写入 |
| `getWeather` | 和风天气免费接口 + 缓存 + 出行建议 |
| `medicineReminder` | 定时触发器：按药品时间推送服药订阅消息 |
| `emergencyAlert` | 跌倒呼救：记录位置 + 推送紧急提醒给子女 |
| `family` | 子女绑定/解除/只读汇总 |
| `wxRun` | 通过 cloudID 云调用读取微信运动步数 |

## 二、上线前必须完成的配置

### 1. 导入项目并替换 AppID

1. 微信开发者工具“导入项目”，目录选本项目。
2. 修改 `project.config.json` 的 `appid` 为你的小程序 AppID。
3. 复制云开发环境 ID，填入 `envList.js` 的 `envId`。

### 2. 创建数据库集合（共 9 个）

`users`、`bp_records`、`medicines`、`medicine_logs`、`activities`、
`meals`、`emergency_logs`、`weather_cache`、`medical_visits`

> 若想先只跑基础功能，至少创建前 5 个 + `weather_cache`；第二版页面
> （活动/饮食/就医/呼救）需要用到其余集合。

### 3. 每个集合配置“自定义安全规则”

本项目部分文档由云函数创建，**不要**用默认“仅创建者可读写”，请把每个集合
权限设为“自定义安全规则”并粘贴：

```json
{
  "read": "doc.openid == auth.openid || (doc.familyOpenid != null && doc.familyOpenid == auth.openid)",
  "write": "doc.openid == auth.openid"
}
```

- 本人可读写自己的数据；
- 已绑定子女（`familyOpenid` 匹配）可只读；
- 所有写入都会带 `openid`，因此规则生效。

### 4. 部署云函数

对 `cloudfunctions` 下每个目录执行：右键 → 上传并部署：云端安装依赖：

`login`、`saveBpRecord`、`getWeather`、`medicineReminder`、
`emergencyAlert`、`family`、`wxRun`

部署 `medicineReminder` 后单独执行一次：右键 → 上传触发器。

### 5. 云函数环境变量

| 函数 | 变量 | 值 |
| --- | --- | --- |
| getWeather | `QWEATHER_KEY` | 和风天气 Key |
| medicineReminder | `MEDICINE_TEMPLATE_ID` | 服药提醒模板 ID |
| emergencyAlert | `EMERGENCY_TEMPLATE_ID` | 紧急提醒模板 ID |
| medicineReminder / emergencyAlert | `MSG_STATE` | 开发测试填 `developer`；发布前改 `formal` |

同时在 `config.js` 填写 `MEDICINE_TEMPLATE_ID`（用于添加药品时弹订阅授权）。
`wxRun` 无需额外配置（使用 cloudID 云调用）。

#### 天气 API（免费）

1. 注册[和风天气](https://qweather.com/)，创建项目选“免费订阅”。
2. 复制 API Key 填入 `getWeather` 环境变量。
3. 云函数在服务端调用，无需配置 request 合法域名。

### 6. 订阅消息模板（需申请两类）

微信公众平台 → 功能 → 订阅消息 → 公共模板库：

**服药提醒模板**（建议字段）：
- 药品名称（thing）
- 服药时间（time）
- 温馨提示（thing）

**紧急提醒模板**（建议字段）：
- 提醒事项（thing）
- 提醒时间（time）
- 地点/说明（thing）

分别填入对应云函数环境变量后，检查 `medicineReminder/index.js` 与
`emergencyAlert/index.js` 中 `data` 的键名是否与模板一致
（默认 `thing1/time2/thing3`）。

### 7. 用户隐私保护指引

公众平台 → 设置 → 服务内容声明 → 用户隐私保护指引，声明会用到：

- 位置信息（本地天气、跌倒呼救定位）
- 微信运动步数（每日活动）
- 相册/摄像头（饮食拍照）
- 手机号（紧急联系人由用户手动填写，不自动读取）

否则真机上 `wx.getLocation / wx.getWeRunData / wx.chooseMedia` 会被隐私协议拦截。

### 8. 建议索引（数据量大后再建）

- `bp_records`：`openid` + `type` + `date`
- `medicines`：`openid`
- `medicine_logs`：`openid` + `date`
- `activities / meals / medical_visits / emergency_logs`：`openid`
- `weather_cache`：`cacheKey`

## 三、数据集合字段

```text
users
  openid, avatarFileID, name, age, history, allergy,
  emergencyName, emergencyPhone, familyBindCode, familyOpenid

bp_records
  openid, type(bp/sugar), date, sbp, dbp, sugar, heartRate, note, createTime

medicines
  openid, name, dosage, time(HH:mm), note, createTime

medicine_logs
  openid, medicineId, date, status(taken/reminded), takenTime,
  remindSent, sendError, createTime

activities
  openid, date, steps, durationMin, source(manual/wechat), note, createTime

meals
  openid, date, mealType(breakfast/lunch/dinner/snack),
  note, imageFileID, createTime

emergency_logs
  openid, date, latitude, longitude, locationText, source,
  familyOpenid, sendSuccess, status, createTime

medical_visits
  openid, date, hospital, department, diagnosis, advice, createTime

weather_cache
  cacheKey, locationName, weather, date, createTime
```

## 四、完整验收流程

1. 首页出现天气与出行建议；今日状态区显示用药/血压。
2. 我的 → 健康档案填写并保存；`users` 集合出现带 openid 的文档。
3. 健康记录：保存血压后列表与趋势图出现，首页变“✓ 已测”。
4. 用药：添加药品 → 授权服药提醒 → 点击状态切换已服/漏服。
5. 活动：先手动记录，再试“读取今日步数”（需先授权微信运动）。
6. 饮食：拍照保存后历史列表出现缩略图。
7. 就医：保存一条记录，时间线出现。
8. 呼救：我的 → 子女帮设置生成绑定码 → 用另一微信号打开分享链接输入绑定码；
   首页“我摔倒了”确认后，子女端 `family` 页面能看到呼救记录。
9. 数据导出：生成 JSON 文件分享保存。

## 五、注意点

- 饮食照片存于云存储。若子女端看不到照片，请到云开发“存储”中把权限设为
  “所有用户可读，仅创建者可写”，或后续改用云函数签发临时链接。
- 微信运动需要用户曾开启“微信运动”且授权 `scope.werun`；开发者工具中可能
  返回模拟数据，以真机为准。
- 跌倒呼救的“短信通知家人”能力依赖运营商通道，第一版采用更通用的
  微信订阅消息 + 系统拨号实现；如需短信，后续可接入短信服务商。
- 首页语音播报为预留入口，正式语音需接入“微信同声传译”插件或云 TTS。

## 六、适老化验收自查

- 正文字号 ≥ 36rpx，标题/数字 ≥ 44rpx，点击区 ≥ 110rpx。
- 主色深蓝 `#2C5F8A` + 强调暖橙 `#F5A623` + 米白背景 `#FDF8F0`。
- 状态均用“图标 + 文字”双重提示，不只依赖红绿色。
- 紧急呼救两步内完成；导航无多级嵌套。
