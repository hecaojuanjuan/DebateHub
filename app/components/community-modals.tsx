"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  Copy,
  Radio,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { State, Member, JoinRequest, CommunityLink } from "@/lib/types";
import MemberManager from "./member-manager";
import { usernameHint, usernamePattern } from "@/lib/usernames";

export type ModalName =
  | "join"
  | "login"
  | "admin"
  | "account"
  | "password"
  | "invite"
  | "publish"
  | "editTopic"
  | "withdrawTopic"
  | "leave"
  | "settings"
  | "guide"
  | "community"
  | "members"
  | "switch"
  | null;
export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="modal"
    >
      <div className="modal-inner">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={20} />
        </button>
        <span className="eyebrow">DEBATEHUB COMMUNITY</span>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </dialog>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function AccountFields({ register = false }: { register?: boolean }) {
  return (
    <>
      <Field label="用户名（支持中文，用于登录）">
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern={usernamePattern}
          minLength={2}
          maxLength={64}
          title={usernameHint}
          placeholder="例如：禾草卷卷（2–32 个字符）"
          required
        />
        <small className="username-hint">{usernameHint}</small>
      </Field>
      <Field label={register ? "设置密码（10–128 字符）" : "密码"}>
        <input
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={10}
          maxLength={128}
          placeholder={register ? "可以用一句容易记住的长句" : "输入你的密码"}
          required
        />
      </Field>
      {register && (
        <Field label="再次输入密码">
          <input
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </Field>
      )}
    </>
  );
}
type Props = {
  modal: ModalName;
  setModal: (value: ModalName) => void;
  data: State | null;
  busy: boolean;
  invite: string;
  setupToken: string;
  clearSetupToken: () => void;
  inviteUrl: string;
  communityId: string;
  deleteTarget: string | null;
  setDeleteTarget: (value: string | null) => void;
  notify: (value: string) => void;
  perform: (
    path: string,
    body: Record<string, unknown>,
    done?: (result: Record<string, any>) => void,
  ) => void;
  selectTopic: (value: string) => void;
  members: Member[] | null;
  requests: JoinRequest[] | null;
  communities: CommunityLink[] | null;
};
export default function CommunityModals({
  modal,
  setModal,
  data,
  busy,
  invite,
  setupToken,
  clearSetupToken,
  inviteUrl,
  communityId,
  deleteTarget,
  setDeleteTarget,
  notify,
  perform,
  selectTopic,
  members,
  requests,
  communities,
}: Props) {
  const [nicknameOnly, setNicknameOnly] = useState(false);
  useEffect(() => setNicknameOnly(false), [modal]);
  const close = () => setModal(null);
  function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    done?: (result: Record<string, any>) => void,
  ) {
    event.preventDefault();
    perform(
      path,
      Object.fromEntries(new FormData(event.currentTarget)),
      done ?? close,
    );
  }
  const topic = data?.topic;
  return (
    <>
      {modal === "join" && (
        <Modal
          title={invite ? "你被邀请，加入这场对话。" : "加入你的辩论社区。"}
          subtitle={`加入${data?.community.name || "社区"}，让你的观点被认真听见。`}
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              perform(
                !data?.viewer && !nicknameOnly ? "auth/register" : "join",
                { ...values, invite: values.invite || invite },
                (result) => {
                  close();
                  history.replaceState(null, "", location.pathname);
                  notify(
                    result.pending
                      ? "申请已提交，请等待群主或管理员审核"
                      : result.joined
                        ? "欢迎加入，一起交换观点"
                        : "邀请已失效，请获取新邀请后重试",
                  );
                },
              );
            }}
          >
            <Field label="你希望大家怎么称呼你？">
              <input
                name="nickname"
                placeholder="输入昵称（2–20 字）"
                minLength={2}
                maxLength={20}
                defaultValue={data?.viewer?.nickname}
                required
                autoComplete="nickname"
              />
            </Field>
            {!data?.viewer && !nicknameOnly && <AccountFields register />}
            {!invite && data?.community.visibility !== "public" && (
              <Field label="邀请凭证">
                <input
                  name="invite"
                  placeholder="粘贴邀请链接或凭证"
                  required
                  onChange={(e) => {
                    if (e.target.value.includes("#invite="))
                      e.target.value = e.target.value.split("#invite=")[1];
                  }}
                />
              </Field>
            )}
            <p className="form-note">
              <ShieldCheck size={15} />
              {data?.viewer?.username || (!data?.viewer && !nicknameOnly)
                ? "注册后可在其他设备登录，保留社区身份。请妥善保存账号密码，当前暂不支持自动找回。"
                : "快速昵称身份只在当前浏览器保留 30 天。加入后可设置账号，防止身份丢失。"}
            </p>
            <button className="button dark full" disabled={busy}>
              {busy
                ? "正在加入…"
                : !data?.viewer && !nicknameOnly
                  ? data?.community.joinApproval
                    ? "注册并申请加入"
                    : "注册并加入社区"
                  : data?.community.joinApproval ||
                      ["removed", "rejected"].includes(
                        data?.viewer?.joinStatus || "",
                      )
                    ? "提交入群申请"
                    : "进入社区，开始思考"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button center"
              onClick={() => setModal("login")}
            >
              已有账号？登录
              <ArrowUpRight size={14} />
            </button>
            {!data?.viewer && (
              <button
                type="button"
                className="text-button center"
                disabled={busy}
                onClick={() => setNicknameOnly(!nicknameOnly)}
              >
                {nicknameOnly
                  ? "设置用户名和密码，注册账号"
                  : "先用昵称快速参与"}
              </button>
            )}
          </form>
        </Modal>
      )}
      {modal === "login" && (
        <Modal
          title="欢迎回来。"
          subtitle="使用用户名和密码登录，继续你的讨论。"
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(
                "auth/login",
                {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  invite,
                },
                (result) => {
                  if (result.joined) {
                    close();
                    history.replaceState(null, "", location.pathname);
                    notify("登录成功，社区身份已恢复");
                  } else if (result.pending) {
                    close();
                    history.replaceState(null, "", location.pathname);
                    notify("已登录，入群申请正在等待审核");
                  } else {
                    setModal("join");
                    notify("已登录，使用有效邀请即可加入这个社区");
                  }
                },
              );
            }}
          >
            <AccountFields />
            <button className="button dark full" disabled={busy}>
              {busy ? "正在登录…" : "登录"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button center"
              onClick={() => setModal("join")}
            >
              还没有账号？注册并加入
            </button>
            {communityId === "unnc" && (
              <button
                type="button"
                className="text-button center"
                onClick={() => setModal("admin")}
              >
                初始群主口令入口
              </button>
            )}
          </form>
        </Modal>
      )}
      {modal === "account" && (
        <Modal
          title={setupToken ? "设置你的群主账号。" : "为当前身份设置账号。"}
          subtitle={
            setupToken
              ? "为宁诺例辩群主设置用户名和密码。此入口仅能使用一次，请勿转发。"
              : "设置后可在手机和电脑登录，已有权限、投票和发言会保留。"
          }
          onClose={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(
                "auth/register",
                {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  setupToken,
                },
                () => {
                  clearSetupToken();
                  close();
                  history.replaceState(null, "", location.pathname);
                  notify("账号已设置，可使用用户名和密码登录");
                },
              );
            }}
          >
            <Field label="社区昵称（其他成员看到的名字）">
              <input
                name="nickname"
                defaultValue={data?.viewer?.nickname || "社区负责人"}
                minLength={2}
                maxLength={20}
                autoComplete="nickname"
                required
              />
            </Field>
            <AccountFields register />
            <p className="form-note">
              <ShieldCheck size={15} />
              请妥善保存账号密码，当前暂不支持自动找回。用户名只用于登录，匿名发表时仍会隐藏社区昵称。
            </p>
            <button className="button dark full" disabled={busy}>
              {busy
                ? "正在设置…"
                : setupToken
                  ? "设置账号并以群主身份进入"
                  : "保存登录账号"}
              <ShieldCheck size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "password" && (
        <Modal
          title="修改登录密码。"
          subtitle={`当前账号：${data?.viewer?.username || ""}。修改后，其他设备的登录会失效。`}
          onClose={close}
        >
          <form
            onSubmit={(e) =>
              submit(e, "auth/password", () => {
                close();
                notify("密码已修改，其他设备已退出登录");
              })
            }
          >
            <Field label="当前密码">
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                minLength={10}
                maxLength={128}
                required
              />
            </Field>
            <Field label="新密码（10–128 字符）">
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </Field>
            <Field label="再次输入新密码">
              <input
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              {busy ? "正在修改…" : "保存新密码"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "admin" && (
        <Modal
          title="欢迎回来，组织者。"
          subtitle="输入管理员口令，管理社区的每一次观点交锋。"
          onClose={close}
        >
          <form
            onSubmit={(e) =>
              submit(e, "admin/login", (result) => {
                setModal(result.hasAccount ? null : "account");
                notify(
                  result.hasAccount
                    ? "群主登录成功"
                    : "群主登录成功，请设置用户名和密码",
                );
              })
            }
          >
            <Field label="管理员昵称">
              <input
                name="nickname"
                defaultValue="社区管理员"
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <Field label="管理员口令">
              <input
                type="password"
                name="key"
                required
                autoComplete="current-password"
                placeholder="输入管理员口令"
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              进入管理
              <ShieldCheck size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal
          title="让更多好观点，加入进来。"
          subtitle={
            data?.community.joinApproval
              ? "邀请链接 7 天有效。成员注册或登录后提交申请，由群主或管理员审核。"
              : "邀请链接 7 天有效。新成员注册账号加入，已有账号的成员可直接登录。"
          }
          onClose={close}
        >
          {inviteUrl ? (
            <>
              <div className="qr-wrapper">
                <QRCodeSVG
                  value={inviteUrl}
                  size={200}
                  level="M"
                  marginSize={3}
                />
                <strong>{data?.community.name} · 扫码加入</strong>
                <small>一起交换观点，练习思考。</small>
              </div>
              <div className="copy-box">
                <input readOnly value={inviteUrl} aria-label="邀请链接" />
                <button
                  className="icon-button"
                  aria-label="复制邀请链接"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(inviteUrl)
                      .then(() => notify("邀请链接已复制"))
                      .catch(() => notify("请选中链接手动复制"))
                  }
                >
                  <Copy size={18} />
                </button>
              </div>
              <button
                className="button dark full"
                onClick={() => {
                  const svg = document.querySelector(".qr-wrapper svg");
                  if (!svg) return;
                  const blob = new Blob(
                    [new XMLSerializer().serializeToString(svg)],
                    { type: "image/svg+xml" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${communityId}-invite.svg`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                下载邀请二维码
                <ArrowDown size={16} />
              </button>
            </>
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>{busy ? "正在生成邀请…" : "生成失败，请关闭后重试。"}</p>
            </div>
          )}
        </Modal>
      )}
      {(modal === "publish" || modal === "editTopic") && (
        <Modal
          title={
            modal === "editTopic"
              ? "修改这道辩题。"
              : "一个好问题，打开新的可能。"
          }
          subtitle={
            modal === "editTopic"
              ? "已有观点与投票会保留；有人参与后，双方立场名称不可更改。"
              : "写清辩题与双方立场，让讨论更有方向。"
          }
          onClose={close}
        >
          <form
            key={modal === "editTopic" ? topic?.id : "new"}
            onSubmit={(e) =>
              submit(
                e,
                modal === "editTopic" ? "topics/update" : "topics/create",
                (result) => {
                  selectTopic(result.id || topic?.id);
                  close();
                  notify(modal === "editTopic" ? "辩题已更新" : "新辩题已发布");
                },
              )
            }
          >
            {modal === "editTopic" && (
              <input type="hidden" name="topicId" value={topic?.id} />
            )}
            <Field label="辩题">
              <input
                name="title"
                defaultValue={modal === "editTopic" ? topic?.title : ""}
                placeholder="例如：大学教育应以通识教育为主"
                minLength={5}
                maxLength={120}
                required
              />
            </Field>
            <Field label="背景与讨论范围">
              <textarea
                name="description"
                defaultValue={modal === "editTopic" ? topic?.description : ""}
                rows={3}
                minLength={5}
                maxLength={3000}
                placeholder="写下背景、定义或希望讨论的方向…"
                required
              />
            </Field>
            <div className="form-grid">
              <Field label="正方立场">
                <input
                  name="proLabel"
                  defaultValue={modal === "editTopic" ? topic?.proLabel : ""}
                  disabled={
                    modal === "editTopic" &&
                    !!(topic?.voteCount || topic?.commentCount)
                  }
                  minLength={2}
                  maxLength={80}
                  placeholder="正方支持的观点"
                  required
                />
              </Field>
              <Field label="反方立场">
                <input
                  name="conLabel"
                  defaultValue={modal === "editTopic" ? topic?.conLabel : ""}
                  disabled={
                    modal === "editTopic" &&
                    !!(topic?.voteCount || topic?.commentCount)
                  }
                  minLength={2}
                  maxLength={80}
                  placeholder="反方支持的观点"
                  required
                />
              </Field>
            </div>
            <Field label="分类">
              <input
                name="category"
                defaultValue={
                  modal === "editTopic" ? topic?.category : "每周训练"
                }
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              {modal === "editTopic" ? "保存修改" : "发布，开始讨论"}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="给好的讨论，一个好空间。"
          subtitle="管理社群的可见性、邀请和讨论状态。"
          onClose={close}
        >
          <div className="setting-row">
            <div>
              <strong>成员与入群审核</strong>
              <p>
                {data?.pendingCount
                  ? `${data.pendingCount} 条申请待审核`
                  : "查看全部成员、处理入群申请"}
              </p>
            </div>
            <button
              className="button small outline"
              onClick={() => setModal("members")}
            >
              管理成员
            </button>
          </div>
          {data?.viewer?.role === "owner" && (
            <>
              <div className="setting-row">
                <div>
                  <strong>入群需审核</strong>
                  <p>
                    {data.community.joinApproval
                      ? "受邀成员须经群主或管理员同意"
                      : "默认关闭，邀请链接可直接加入"}
                  </p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() =>
                    perform(
                      "settings",
                      { joinApproval: !data.community.joinApproval },
                      () =>
                        notify(
                          data.community.joinApproval
                            ? "已关闭审核，新邀请可直接加入；已有申请仍需处理"
                            : "已开启入群审核",
                        ),
                    )
                  }
                >
                  {data.community.joinApproval ? "关闭审核" : "开启审核"}
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>社群可见性</strong>
                  <p>
                    {data.community.visibility === "private"
                      ? "仅受邀成员能查看和参与"
                      : "任何人能查看，加入后能参与"}
                  </p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() =>
                    perform("settings", {
                      visibility:
                        data.community.visibility === "private"
                          ? "public"
                          : "private",
                    })
                  }
                >
                  {data.community.visibility === "private"
                    ? "设为公开"
                    : "设为私密"}
                </button>
              </div>
            </>
          )}
          {topic && (
            <div className="setting-row">
              <div>
                <strong>当前辩题</strong>
                <p>
                  {topic.status === "open"
                    ? "成员可以选择持方与发言"
                    : "已结束，可查看历史讨论"}
                </p>
              </div>
              <button
                className="button small outline"
                disabled={busy || topic.withdrawn}
                onClick={() =>
                  perform("topics/status", {
                    topicId: topic.id,
                    status: topic.status === "open" ? "closed" : "open",
                  })
                }
              >
                {topic.status === "open" ? "结束讨论" : "重新开放"}
              </button>
            </div>
          )}
          {topic && (
            <>
              <div className="setting-row">
                <div>
                  <strong>修改辩题</strong>
                  <p>编辑题目、背景和分类</p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() => setModal("editTopic")}
                >
                  修改辩题
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>{topic.withdrawn ? "恢复辩题" : "撤回辩题"}</strong>
                  <p>
                    {topic.withdrawn
                      ? "恢复后成员可再次看到，讨论状态保持原样"
                      : "向成员隐藏，保留全部讨论和投票"}
                  </p>
                </div>
                <button
                  className="button small outline danger"
                  disabled={busy}
                  onClick={() =>
                    topic.withdrawn
                      ? perform(
                          "topics/withdraw",
                          { topicId: topic.id, withdrawn: false },
                          () => notify("辩题已恢复"),
                        )
                      : setModal("withdrawTopic")
                  }
                >
                  {topic.withdrawn ? "恢复辩题" : "撤回辩题"}
                </button>
              </div>
            </>
          )}
          <div className="setting-row">
            <div>
              <strong>邀请链接</strong>
              <p>使所有未使用的邀请失效</p>
            </div>
            <button
              className="button small outline danger"
              disabled={busy}
              onClick={() =>
                perform("invites/revoke", {}, () =>
                  notify("全部邀请已撤销，已加入的成员不受影响"),
                )
              }
            >
              撤销全部邀请
            </button>
          </div>
          <p className="form-note">
            {data?.viewer?.role === "owner"
              ? "你是社群群主，可设置管理员并管理社群。"
              : "你是本社群管理员，可发布辩题、邀请成员并管理讨论。"}
          </p>
        </Modal>
      )}
      {modal === "members" &&
        data &&
        ["owner", "admin"].includes(data.viewer?.role || "") && (
          <Modal
            title="成员与入群审核。"
            subtitle="群主和管理员可查看全部成员、审核申请及移出普通成员；群主可任命管理员。"
            onClose={close}
          >
            <MemberManager
              data={data}
              members={members}
              requests={requests}
              busy={busy}
              perform={perform}
              notify={notify}
            />
            <p className="form-note">
              <ShieldCheck size={15} />
              管理员权限仅在当前社群生效。群主身份不可通过此页面修改。
            </p>
          </Modal>
        )}
      {modal === "switch" && (
        <Modal
          title="我的社群。"
          subtitle="不同的伙伴，不同的问题，同样认真地思考。"
          onClose={close}
        >
          {communities ? (
            communities.map((c) => (
              <a className="community-option" key={c.id} href={`/c/${c.id}`}>
                <span className="community-logo">辩</span>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    {c.role === "owner"
                      ? "群主"
                      : c.role === "admin"
                        ? "管理员"
                        : "成员"}
                  </small>
                </div>
                {c.id === communityId ? (
                  <span className="owner-badge">当前社群</span>
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </a>
            ))
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>正在加载你的社群…</p>
            </div>
          )}
          <button
            className="button dark full"
            onClick={() => setModal("community")}
          >
            ＋ 创建新社群
          </button>
          <button
            className="button outline full account-button"
            onClick={() =>
              setModal(data?.viewer?.username ? "password" : "account")
            }
          >
            {data?.viewer?.username ? "修改登录密码" : "设置用户名和密码"}
          </button>
          {data?.viewer?.username && (
            <p className="form-note">登录用户名：{data.viewer.username}</p>
          )}
          {data?.viewer?.role && data.viewer.role !== "owner" && (
            <button
              className="text-button center danger"
              onClick={() => setModal("leave")}
            >
              退出当前社群
            </button>
          )}
        </Modal>
      )}
      {modal === "leave" && (
        <Modal
          title="退出当前社群？"
          subtitle="退出后将无法访问私密社区，历史观点和投票会保留。账号及其他社群不受影响。"
          onClose={close}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform("members/leave", {}, () => {
                close();
                notify("已退出当前社群，账号仍可登录");
              })
            }
          >
            确认退出社群
          </button>
        </Modal>
      )}
      {modal === "withdrawTopic" && topic && (
        <Modal
          title="撤回这道辩题？"
          subtitle="成员将无法查看和参与这道辩题，已有观点、回复与投票全部保留。群主或管理员可在全部辩题中恢复。"
          onClose={close}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform(
                "topics/withdraw",
                { topicId: topic.id, withdrawn: true },
                () => {
                  close();
                  notify("辩题已撤回，成员端已隐藏");
                },
              )
            }
          >
            确认撤回辩题
          </button>
        </Modal>
      )}
      {modal === "community" && (
        <Modal
          title="为新的伙伴，开一个空间。"
          subtitle="每个社区有独立的辩题、成员、邀请和讨论。"
          onClose={close}
        >
          <form
            onSubmit={(e) =>
              submit(e, "communities/create", (result) =>
                window.location.assign(`/c/${result.slug}`),
              )
            }
          >
            <Field label="社区名称">
              <input name="name" minLength={2} maxLength={40} required />
            </Field>
            <Field label="地址标识（小写字母、数字、短横线）">
              <input
                name="slug"
                pattern="[a-z][a-z0-9-]{1,39}"
                minLength={2}
                maxLength={40}
                required
                placeholder="例如 debate-club"
              />
            </Field>
            <Field label="社区介绍">
              <textarea
                name="description"
                minLength={2}
                maxLength={300}
                required
                rows={3}
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              创建私密社区
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          title="观点不同，也能一起向前。"
          subtitle="欢迎来到 DebateHub，一个认真思考、自由表达的地方。"
          onClose={close}
        >
          {[
            [
              "01",
              "进入你的社区",
              "扫描管理员的邀请二维码，注册账号或登录后加入。公开社区可以直接浏览并加入。",
            ],
            [
              "02",
              "选择持方，给出理由",
              "选择正方或反方，再发表观点。你可以改变持方；历史发言保留发表时的立场。",
            ],
            [
              "03",
              "回应观点，尊重彼此",
              "用论据支持判断，用回复推动讨论。持方比例反映选择，与发言条数无关。",
            ],
          ].map(([n, title, content]) => (
            <div className="guide-step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{content}</p>
              </div>
            </div>
          ))}
          <p className="form-note">
            用户名用于登录，社区昵称用于发言。也可先用昵称快速参与，再在「我的社群」设置账号以保留身份。请妥善保存账号密码，当前暂不支持自动找回。
          </p>
          <button className="button dark full" onClick={close}>
            明白了，一起思考
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="移除这条观点？"
          subtitle="移除后保留回复关系，正文不可恢复。"
          onClose={() => setDeleteTarget(null)}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform("comments/delete", { commentId: deleteTarget }, () => {
                setDeleteTarget(null);
                notify("观点已移除");
              })
            }
          >
            确认移除
            <Trash2 size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
