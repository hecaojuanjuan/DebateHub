import { systemMessageKey, translate, type Locale } from "./core";

export const errorMessages: Record<string, string> = {
  社区不存在: "Community not found.",
  此操作需要社群群主或管理员权限:
    "Only the community owner or an admin can do this.",
  请先加入社区: "Please join this community first.",
  "这是私密社区，请使用有效邀请链接加入":
    "This is a private community. Join with a valid invitation.",
  辩题不存在: "Motion not found.",
  "该辩题已撤回，暂不能参与":
    "This motion has been withdrawn. Participation is paused.",
  "本次讨论已结束，仍可查看全部观点":
    "This discussion is closed. You can still read all posts.",
  请求内容过长: "Your request is too large. Please shorten it.",
  "请使用 JSON 请求": "Invalid request format. Please refresh and try again.",
  "请求来源无效，请刷新页面重试":
    "Invalid request origin. Please refresh and try again.",
  请求格式无效: "Invalid request format. Please try again.",
  "操作太频繁，请一分钟后重试":
    "Too many attempts. Please wait a minute and try again.",
  "密码需为 10–128 个字符，可以使用容易记住的长句":
    "Use a password with 10–128 characters. A memorable passphrase works well.",
  两次输入的密码不一致: "The passwords do not match.",
  只有初始群主可以生成账号设置链接:
    "Only the initial community owner can create an account setup link.",
  "群主账号已设置，请使用用户名和密码登录":
    "The owner account is already set up. Sign in with its username and password.",
  请先登录: "Please sign in first.",
  请先设置登录账号: "Please set up a login account first.",
  当前密码不正确: "The current password is incorrect.",
  "密码刚刚发生变化，请重新登录":
    "The password has just changed. Please sign in again.",
  接口不存在: "This action is unavailable.",
  用户名或密码不正确: "Incorrect username or password.",
  "群主设置链接已失效或已使用，请重新获取":
    "This owner setup link has expired or was used. Request a new link.",
  "用户名已被使用，或当前身份已设置账号，请直接登录":
    "This username is taken, or this identity already has an account. Please sign in.",
  "群主设置链接已失效或已使用，请直接登录":
    "This owner setup link has expired or was used. Please sign in.",
  "邀请无效或已过期，请联系管理员获取新邀请":
    "Invalid or expired invitation. Ask an admin for a new one.",
  群主暂不能退出自己创建的社群:
    "The owner cannot leave their own community yet.",
  请选择同意或拒绝: "Choose whether to approve or decline the request.",
  "这条申请已处理或不存在，请刷新列表":
    "This request was already reviewed or no longer exists. Refresh the list.",
  请使用退出社群操作: "Use “Leave this community” to leave.",
  该成员不在此社群: "This member is not in this community.",
  不能移出群主: "The owner cannot be removed.",
  管理员只能移出普通成员: "Admins can only remove regular members.",
  "成员权限已变化，请刷新列表":
    "Member permissions have changed. Refresh the list.",
  请选择撤回或恢复辩题: "Choose whether to withdraw or restore this motion.",
  "已有成员参与，不能更改双方立场名称；可撤回后发布新的辩题":
    "People have already participated, so side labels cannot change. Withdraw this motion and publish a new one if needed.",
  "辩题参与情况已变化，请刷新后再编辑":
    "Participation has changed. Refresh before editing.",
  连接来源无效: "Invalid connection origin.",
  实时连接暂不可用: "Live updates are temporarily unavailable.",
  连接暂不可用: "The connection is temporarily unavailable.",
  请先加入一个社群: "Please join a community first.",
  "管理员口令尚未配置，请设置 ADMIN_KEY":
    "The administrator key is not configured. Contact the site owner.",
  管理员口令不正确: "The administrator key is incorrect.",
  "平台初始口令仅用于宁诺例辩；其他社群的管理权由各自群主分配":
    "The initial key only manages UNNC Debate. Other communities are managed by their own owners.",
  "社区标识只能包含小写字母、数字和短横线":
    "Use lowercase letters, numbers, and hyphens for the community URL name.",
  此社区标识已被使用: "This community URL name is already in use.",
  只有群主可以添加或撤销管理员: "Only the owner can appoint or remove admins.",
  不能修改群主的角色: "The owner’s role cannot be changed.",
  只能设置为管理员或普通成员: "Choose either Admin or Member.",
  只有群主可以更改社群可见性: "Only the owner can change community visibility.",
  请提供需要修改的设置: "Choose a setting to update.",
  可见性无效: "Invalid visibility setting.",
  入群审核设置无效: "Invalid join approval setting.",
  讨论状态无效: "Invalid discussion status.",
  请选择正方或反方: "Choose the pro or con side.",
  匿名选项必须为是或否: "Invalid anonymity setting.",
  "辩题或成员状态已变化，请刷新后重试":
    "The motion or membership status has changed. Refresh and try again.",
  "请先选择持方，再发表观点": "Choose a side before posting.",
  回复的观点不存在: "The post you are replying to no longer exists.",
  观点不存在: "Post not found.",
  只能移除自己的观点: "You can only remove your own posts.",
  "同时登录的人较多，请稍等几秒再试":
    "Many people are signing in. Wait a few seconds and try again.",
  "服务暂时不可用，请稍后重试":
    "The service is temporarily unavailable. Please try again shortly.",
};
const fields: Record<string, string> = {
  昵称: "Nickname",
  成员标识: "Member ID",
  辩题标识: "Motion ID",
  正方立场: "Pro position",
  反方立场: "Con position",
  辩题: "Motion",
  背景介绍: "Background",
  分类: "Category",
  社区标识: "Community URL name",
  社区名称: "Community name",
  社区介绍: "Community description",
  观点标识: "Post ID",
  观点: "Viewpoint",
};

export function translateError(message: string, locale: Locale) {
  const known = systemMessageKey(message);
  if (known) return translate(locale, known);
  if (
    /Failed to fetch|fetch failed|NetworkError|Load failed|network connection/i.test(
      message,
    )
  )
    return translate(locale, "Unable to connect. Please try again.");
  if (/abort|timed? ?out/i.test(message))
    return translate(locale, "Connection timed out. Reconnecting…");
  if (locale === "zh") return message;
  if (errorMessages[message]) return errorMessages[message];
  if (message.startsWith("用户名需为 "))
    return (
      "Username: " +
      translate(
        locale,
        "2–32 characters: Chinese or English letters, numbers, dots, underscores, or hyphens. Start with a letter or number. No spaces.",
      )
    );
  const length = message.match(/^(.*?)需为 (\d+)–(\d+) 个字符$/);
  if (length)
    return (
      (fields[length[1]] || "This field") +
      " must contain " +
      length[2] +
      "–" +
      length[3] +
      " characters."
    );
  return message;
}
