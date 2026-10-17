"use client";

import { useLanguage, LanguageSwitcher } from "./language-provider";
import { LocalizedForm } from "./localized-form";

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
import { localizedUrl } from "@/lib/i18n/core";
import { usernamePattern } from "@/lib/usernames";

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
  notice,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  notice?: string;
}) {
  const { t, errorText } = useLanguage();
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
          aria-label={t("Close")}
        >
          <X size={20} />
        </button>
        <div className="modal-topline">
          <span className="eyebrow">DEBATEHUB COMMUNITY</span>
          <LanguageSwitcher />
        </div>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {notice && (
          <p className="modal-notice" role="alert">
            {errorText(notice)}
          </p>
        )}
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
  const { t } = useLanguage();
  return (
    <>
      <Field label={t("Username (Chinese supported)")}>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          pattern={usernamePattern}
          minLength={2}
          maxLength={64}
          title={t(
            "2–32 characters: Chinese or English letters, numbers, dots, underscores, or hyphens. Start with a letter or number. No spaces.",
          )}
          placeholder={t("e.g. DebateFan (2–32 characters)")}
          required
        />
        <small className="username-hint">
          {t(
            "2–32 characters: Chinese or English letters, numbers, dots, underscores, or hyphens. Start with a letter or number. No spaces.",
          )}
        </small>
      </Field>
      <Field
        label={register ? t("Set password (10–128 characters)") : t("Password")}
      >
        <input
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={10}
          maxLength={128}
          placeholder={
            register
              ? t("Try a memorable passphrase")
              : t("Enter your password")
          }
          required
        />
      </Field>
      {register && (
        <Field label={t("Confirm password")}>
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
  feedback: string;
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
  feedback,
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
  const { t, locale, communityName } = useLanguage();
  const displayName = communityName(data?.community.name, communityId);
  const localizedInvite = inviteUrl ? localizedUrl(inviteUrl, locale) : "";
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
          notice={feedback}
          title={
            invite
              ? t("You’re invited to the conversation.")
              : t("Join your debate community.")
          }
          subtitle={t("Join {name}. Your perspective belongs here.", {
            name: displayName,
          })}
          onClose={close}
        >
          <LocalizedForm
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              perform(
                !data?.viewer && !nicknameOnly ? "auth/register" : "join",
                { ...values, invite: values.invite || invite },
                (result) => {
                  close();
                  history.replaceState(
                    null,
                    "",
                    location.pathname + location.search,
                  );
                  notify(
                    result.pending
                      ? t(
                          "Request submitted. Please wait for an owner or admin to approve it.",
                        )
                      : result.joined
                        ? t("Welcome! Let’s exchange ideas.")
                        : t("This invitation has expired. Ask for a new one."),
                  );
                },
              );
            }}
          >
            <Field label={t("What should we call you?")}>
              <input
                name="nickname"
                placeholder={t("Enter a nickname (2–20 characters)")}
                minLength={2}
                maxLength={20}
                defaultValue={data?.viewer?.nickname}
                required
                autoComplete="nickname"
              />
            </Field>
            {!data?.viewer && !nicknameOnly && <AccountFields register />}
            {!invite && data?.community.visibility !== "public" && (
              <Field label={t("Invitation token")}>
                <input
                  name="invite"
                  placeholder={t("Paste an invitation link or token")}
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
                ? t(
                    "An account keeps your community identity across devices. Save your login details; password recovery is not available yet.",
                  )
                : t(
                    "A quick nickname lasts 30 days in this browser. Set up an account after joining to keep your identity.",
                  )}
            </p>
            <button className="button dark full" disabled={busy}>
              {busy
                ? t("Joining…")
                : !data?.viewer && !nicknameOnly
                  ? data?.community.joinApproval
                    ? t("Register and request to join")
                    : t("Register and join")
                  : data?.community.joinApproval ||
                      ["removed", "rejected"].includes(
                        data?.viewer?.joinStatus || "",
                      )
                    ? t("Request to join")
                    : t("Join the conversation")}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button center"
              onClick={() => setModal("login")}
            >
              {t("Have an account? Sign in")}
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
                  ? t("Register with a username and password")
                  : t("Join quickly with a nickname")}
              </button>
            )}
          </LocalizedForm>
        </Modal>
      )}
      {modal === "login" && (
        <Modal
          notice={feedback}
          title={t("Welcome back.")}
          subtitle={t(
            "Sign in with your username and password to continue the conversation.",
          )}
          onClose={close}
        >
          <LocalizedForm
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
                    history.replaceState(
                      null,
                      "",
                      location.pathname + location.search,
                    );
                    notify(
                      t("Signed in. Your community identity is restored."),
                    );
                  } else if (result.pending) {
                    close();
                    history.replaceState(
                      null,
                      "",
                      location.pathname + location.search,
                    );
                    notify(
                      t(
                        "Signed in. Your request to join is awaiting approval.",
                      ),
                    );
                  } else {
                    setModal("join");
                    notify(
                      t(
                        "Signed in. Use a valid invitation to join this community.",
                      ),
                    );
                  }
                },
              );
            }}
          >
            <AccountFields />
            <button className="button dark full" disabled={busy}>
              {busy ? t("Signing in…") : t("Sign in")}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-button center"
              onClick={() => setModal("join")}
            >
              {t("New here? Register and join")}
            </button>
            {communityId === "unnc" && (
              <button
                type="button"
                className="text-button center"
                onClick={() => setModal("admin")}
              >
                {t("Initial owner access")}
              </button>
            )}
          </LocalizedForm>
        </Modal>
      )}
      {modal === "account" && (
        <Modal
          notice={feedback}
          title={
            setupToken
              ? t("Set up your owner account.")
              : t("Keep your identity with an account.")
          }
          subtitle={
            setupToken
              ? t(
                  "Set a username and password for the UNNC Debate owner. This link works once. Please do not share it.",
                )
              : t(
                  "Sign in on your phone or computer. Your roles, votes, and posts stay with you.",
                )
          }
          onClose={close}
        >
          <LocalizedForm
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
                  history.replaceState(
                    null,
                    "",
                    location.pathname + location.search,
                  );
                  notify(
                    t(
                      "Account created. You can now sign in with your username and password.",
                    ),
                  );
                },
              );
            }}
          >
            <Field label={t("Community nickname (shown to other members)")}>
              <input
                name="nickname"
                defaultValue={
                  data?.viewer?.nickname || t("Community organizer")
                }
                minLength={2}
                maxLength={20}
                autoComplete="nickname"
                required
              />
            </Field>
            <AccountFields register />
            <p className="form-note">
              <ShieldCheck size={15} />
              {t(
                "Save your login details; password recovery is not available yet. Your username is only for signing in. Anonymous posts still hide your community nickname.",
              )}
            </p>
            <button className="button dark full" disabled={busy}>
              {busy
                ? t("Setting up…")
                : setupToken
                  ? t("Set up account and enter as owner")
                  : t("Save account")}
              <ShieldCheck size={16} />
            </button>
          </LocalizedForm>
        </Modal>
      )}
      {modal === "password" && (
        <Modal
          notice={feedback}
          title={t("Change your password.")}
          subtitle={t(
            "Account: {name}. Changing your password signs out other devices.",
            { name: data?.viewer?.username || "" },
          )}
          onClose={close}
        >
          <LocalizedForm
            onSubmit={(e) =>
              submit(e, "auth/password", () => {
                close();
                notify(
                  t("Password changed. Other devices have been signed out."),
                );
              })
            }
          >
            <Field label={t("Current password")}>
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                minLength={10}
                maxLength={128}
                required
              />
            </Field>
            <Field label={t("New password (10–128 characters)")}>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
              />
            </Field>
            <Field label={t("Confirm new password")}>
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
              {busy ? t("Saving…") : t("Save new password")}
            </button>
          </LocalizedForm>
        </Modal>
      )}
      {modal === "admin" && (
        <Modal
          notice={feedback}
          title={t("Welcome back, organizer.")}
          subtitle={t("Enter the administrator key to manage your community.")}
          onClose={close}
        >
          <LocalizedForm
            onSubmit={(e) =>
              submit(e, "admin/login", (result) => {
                setModal(result.hasAccount ? null : "account");
                notify(
                  result.hasAccount
                    ? t("Signed in as owner.")
                    : t(
                        "Signed in as owner. Please set up a username and password.",
                      ),
                );
              })
            }
          >
            <Field label={t("Administrator nickname")}>
              <input
                name="nickname"
                defaultValue={t("Community admin")}
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <Field label={t("Administrator key")}>
              <input
                type="password"
                name="key"
                required
                autoComplete="current-password"
                placeholder={t("Enter the administrator key")}
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              {t("Open administration")}
              <ShieldCheck size={16} />
            </button>
          </LocalizedForm>
        </Modal>
      )}
      {modal === "invite" && (
        <Modal
          notice={feedback}
          title={t("Make room for more perspectives.")}
          subtitle={
            data?.community.joinApproval
              ? t(
                  "Invitations last 7 days. Members register or sign in, then request approval from an owner or admin.",
                )
              : t(
                  "Invitations last 7 days. New members register to join; existing members can sign in.",
                )
          }
          onClose={close}
        >
          {inviteUrl ? (
            <>
              <div className="qr-wrapper">
                <QRCodeSVG
                  value={localizedInvite}
                  size={200}
                  level="M"
                  marginSize={3}
                />
                <strong>
                  {t("{name} · Scan to join", { name: displayName })}
                </strong>
                <small>{t("Exchange ideas. Practice thinking.")}</small>
              </div>
              <div className="copy-box">
                <input
                  readOnly
                  value={localizedInvite}
                  aria-label={t("Invitation link")}
                />
                <button
                  className="icon-button"
                  aria-label={t("Copy invitation link")}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(localizedInvite)
                      .then(() => notify(t("Invitation link copied.")))
                      .catch(() =>
                        notify(
                          t("Please select the link and copy it manually."),
                        ),
                      )
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
                {t("Download invitation QR code")}
                <ArrowDown size={16} />
              </button>
            </>
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>
                {busy
                  ? t("Creating invitation…")
                  : t(
                      "Unable to create an invitation. Close this window and try again.",
                    )}
              </p>
            </div>
          )}
        </Modal>
      )}
      {(modal === "publish" || modal === "editTopic") && (
        <Modal
          notice={feedback}
          title={
            modal === "editTopic"
              ? t("Edit this motion.")
              : t("A good question opens new possibilities.")
          }
          subtitle={
            modal === "editTopic"
              ? t(
                  "Existing posts and votes are preserved. Side labels cannot change once someone has participated.",
                )
              : t(
                  "Define the motion and both sides to give the discussion a clear direction.",
                )
          }
          onClose={close}
        >
          <LocalizedForm
            key={modal === "editTopic" ? topic?.id : "new"}
            onSubmit={(e) =>
              submit(
                e,
                modal === "editTopic" ? "topics/update" : "topics/create",
                (result) => {
                  selectTopic(result.id || topic?.id);
                  close();
                  notify(
                    modal === "editTopic"
                      ? t("Motion updated.")
                      : t("New motion published."),
                  );
                },
              )
            }
          >
            {modal === "editTopic" && (
              <input type="hidden" name="topicId" value={topic?.id} />
            )}
            <Field label={t("Motion")}>
              <input
                name="title"
                defaultValue={modal === "editTopic" ? topic?.title : ""}
                placeholder={t(
                  "e.g. Universities should prioritize general education",
                )}
                minLength={5}
                maxLength={120}
                required
              />
            </Field>
            <Field label={t("Background and scope")}>
              <textarea
                name="description"
                defaultValue={modal === "editTopic" ? topic?.description : ""}
                rows={3}
                minLength={5}
                maxLength={3000}
                placeholder={t(
                  "Add context, definitions, or questions to explore…",
                )}
                required
              />
            </Field>
            <div className="form-grid">
              <Field label={t("Pro position")}>
                <input
                  name="proLabel"
                  defaultValue={modal === "editTopic" ? topic?.proLabel : ""}
                  disabled={
                    modal === "editTopic" &&
                    !!(topic?.voteCount || topic?.commentCount)
                  }
                  minLength={2}
                  maxLength={80}
                  placeholder={t("The position supported by the pro side")}
                  required
                />
              </Field>
              <Field label={t("Con position")}>
                <input
                  name="conLabel"
                  defaultValue={modal === "editTopic" ? topic?.conLabel : ""}
                  disabled={
                    modal === "editTopic" &&
                    !!(topic?.voteCount || topic?.commentCount)
                  }
                  minLength={2}
                  maxLength={80}
                  placeholder={t("The position supported by the con side")}
                  required
                />
              </Field>
            </div>
            <Field label={t("Category")}>
              <input
                name="category"
                defaultValue={
                  modal === "editTopic" ? topic?.category : t("Weekly practice")
                }
                minLength={2}
                maxLength={20}
                required
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              {modal === "editTopic" ? t("Save changes") : t("Publish motion")}
              <ArrowUpRight size={16} />
            </button>
          </LocalizedForm>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          notice={feedback}
          title={t("A good space for good discussion.")}
          subtitle={t("Manage visibility, invitations, and discussion status.")}
          onClose={close}
        >
          <div className="setting-row">
            <div>
              <strong>{t("Members and join requests")}</strong>
              <p>
                {data?.pendingCount
                  ? t("Pending requests: {count}", { count: data.pendingCount })
                  : t("See all members and review join requests")}
              </p>
            </div>
            <button
              className="button small outline"
              onClick={() => setModal("members")}
            >
              {t("Manage membership")}
            </button>
          </div>
          {data?.viewer?.role === "owner" && (
            <>
              <div className="setting-row">
                <div>
                  <strong>{t("Require approval to join")}</strong>
                  <p>
                    {data.community.joinApproval
                      ? t(
                          "Invited members need approval from an owner or admin",
                        )
                      : t(
                          "Off by default. A valid invitation grants direct access",
                        )}
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
                            ? t(
                                "Approval disabled. New invitations allow direct joining; existing requests still need review.",
                              )
                            : t("Approval is now required to join."),
                        ),
                    )
                  }
                >
                  {data.community.joinApproval
                    ? t("Disable approval")
                    : t("Enable approval")}
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>{t("Community visibility")}</strong>
                  <p>
                    {data.community.visibility === "private"
                      ? t("Only members can view and participate")
                      : t("Anyone can read; members can participate")}
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
                    ? t("Make public")
                    : t("Make private")}
                </button>
              </div>
            </>
          )}
          {topic && (
            <div className="setting-row">
              <div>
                <strong>{t("Current motion")}</strong>
                <p>
                  {topic.status === "open"
                    ? t("Members can choose a side and post")
                    : t("Closed. Previous discussions remain readable")}
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
                {topic.status === "open"
                  ? t("Close discussion")
                  : t("Reopen discussion")}
              </button>
            </div>
          )}
          {topic && (
            <>
              <div className="setting-row">
                <div>
                  <strong>{t("Edit motion")}</strong>
                  <p>{t("Edit the title, background, and category")}</p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() => setModal("editTopic")}
                >
                  {t("Edit motion")}
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>
                    {topic.withdrawn
                      ? t("Restore motion")
                      : t("Withdraw motion")}
                  </strong>
                  <p>
                    {topic.withdrawn
                      ? t(
                          "Members will see it again. Its open or closed status stays the same",
                        )
                      : t(
                          "Hide from members while preserving all posts and votes",
                        )}
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
                          () => notify(t("Motion restored.")),
                        )
                      : setModal("withdrawTopic")
                  }
                >
                  {topic.withdrawn ? t("Restore motion") : t("Withdraw motion")}
                </button>
              </div>
            </>
          )}
          <div className="setting-row">
            <div>
              <strong>{t("Invitation link")}</strong>
              <p>{t("Invalidate all outstanding invitation links")}</p>
            </div>
            <button
              className="button small outline danger"
              disabled={busy}
              onClick={() =>
                perform("invites/revoke", {}, () =>
                  notify(
                    t(
                      "All invitations revoked. Existing members keep their access.",
                    ),
                  ),
                )
              }
            >
              {t("Revoke all invitations")}
            </button>
          </div>
          <p className="form-note">
            {data?.viewer?.role === "owner"
              ? t(
                  "You own this community and can appoint admins and manage its settings.",
                )
              : t(
                  "You are an admin here. You can publish motions, invite members, and moderate discussion.",
                )}
          </p>
        </Modal>
      )}
      {modal === "members" &&
        data &&
        ["owner", "admin"].includes(data.viewer?.role || "") && (
          <Modal
            notice={feedback}
            title={t("Members and join requests.")}
            subtitle={t(
              "Owners and admins can view members, review requests, and remove regular members. Only the owner can appoint admins.",
            )}
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
              {t(
                "Admin permissions apply only to this community. The owner cannot be changed here.",
              )}
            </p>
          </Modal>
        )}
      {modal === "switch" && (
        <Modal
          notice={feedback}
          title={t("My communities.")}
          subtitle={t(
            "Different people. Different questions. The same curiosity.",
          )}
          onClose={close}
        >
          {communities ? (
            communities.map((c) => (
              <a
                className="community-option"
                key={c.id}
                href={`/c/${c.id}?lang=${locale}`}
              >
                <span className="community-logo">{t("D")}</span>
                <div>
                  <strong>{communityName(c.name, c.id)}</strong>
                  <small>
                    {c.role === "owner"
                      ? t("Owner")
                      : c.role === "admin"
                        ? t("Admin")
                        : t("Member")}
                  </small>
                </div>
                {c.id === communityId ? (
                  <span className="owner-badge">{t("Current community")}</span>
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </a>
            ))
          ) : (
            <div className="empty">
              <Radio className="spin" />
              <p>{t("Loading your communities…")}</p>
            </div>
          )}
          <button
            className="button dark full"
            onClick={() => setModal("community")}
          >
            {t("+ Create a community")}
          </button>
          <button
            className="button outline full account-button"
            onClick={() =>
              setModal(data?.viewer?.username ? "password" : "account")
            }
          >
            {data?.viewer?.username
              ? t("Change password")
              : t("Set up an account")}
          </button>
          {data?.viewer?.username && (
            <p className="form-note">
              {t("Username: ")}
              {data.viewer.username}
            </p>
          )}
          {data?.viewer?.role && data.viewer.role !== "owner" && (
            <button
              className="text-button center danger"
              onClick={() => setModal("leave")}
            >
              {t("Leave this community")}
            </button>
          )}
        </Modal>
      )}
      {modal === "leave" && (
        <Modal
          notice={feedback}
          title={t("Leave this community?")}
          subtitle={t(
            "You will lose access if this community is private. Your posts and votes remain, and your account and other communities are unaffected.",
          )}
          onClose={close}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform("members/leave", {}, () => {
                close();
                notify(
                  t("You have left this community. Your account still works."),
                );
              })
            }
          >
            {t("Confirm leaving")}
          </button>
        </Modal>
      )}
      {modal === "withdrawTopic" && topic && (
        <Modal
          notice={feedback}
          title={t("Withdraw this motion?")}
          subtitle={t(
            "Members will no longer see or participate in this motion. All posts, replies, and votes remain. An owner or admin can restore it from All motions.",
          )}
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
                  notify(t("Motion withdrawn and hidden from members."));
                },
              )
            }
          >
            {t("Confirm withdrawal")}
          </button>
        </Modal>
      )}
      {modal === "community" && (
        <Modal
          notice={feedback}
          title={t("Create a space for your people.")}
          subtitle={t(
            "Each community has its own motions, members, invitations, and discussions.",
          )}
          onClose={close}
        >
          <LocalizedForm
            onSubmit={(e) =>
              submit(e, "communities/create", (result) =>
                window.location.assign(`/c/${result.slug}?lang=${locale}`),
              )
            }
          >
            <Field label={t("Community name")}>
              <input name="name" minLength={2} maxLength={40} required />
            </Field>
            <Field label={t("URL name (lowercase letters, numbers, hyphens)")}>
              <input
                name="slug"
                pattern="[a-z][a-z0-9-]{1,39}"
                minLength={2}
                maxLength={40}
                required
                placeholder={t("e.g. debate-club")}
              />
            </Field>
            <Field label={t("Community description")}>
              <textarea
                name="description"
                minLength={2}
                maxLength={300}
                required
                rows={3}
              />
            </Field>
            <button className="button dark full" disabled={busy}>
              {t("Create private community")}
              <ArrowRight size={16} />
            </button>
          </LocalizedForm>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          notice={feedback}
          title={t("Different views. Moving forward together.")}
          subtitle={t(
            "Welcome to DebateHub, a place for thoughtful discussion and open expression.",
          )}
          onClose={close}
        >
          {[
            [
              "01",
              t("Join your community"),
              t(
                "Scan an admin’s invitation QR code, then register or sign in to join. Public communities can be browsed and joined directly.",
              ),
            ],
            [
              "02",
              t("Choose a side. Share your reasons."),
              t(
                "Choose pro or con before posting. You can change sides; earlier posts keep the position held when they were written.",
              ),
            ],
            [
              "03",
              t("Discuss ideas. Respect each other."),
              t(
                "Support your views with evidence and move the discussion forward through replies. Vote ratios count people, not posts.",
              ),
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
            {t(
              "Your username is for signing in; your nickname appears on posts. You can join with a nickname first and create an account in My communities later. Save your login details; password recovery is not available yet.",
            )}
          </p>
          <button className="button dark full" onClick={close}>
            {t("Got it. Let’s think together.")}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          notice={feedback}
          title={t("Remove this post?")}
          subtitle={t(
            "Replies stay in place, but the post’s text cannot be recovered.",
          )}
          onClose={() => setDeleteTarget(null)}
        >
          <button
            className="button dark full"
            disabled={busy}
            onClick={() =>
              perform("comments/delete", { commentId: deleteTarget }, () => {
                setDeleteTarget(null);
                notify(t("Post removed."));
              })
            }
          >
            {t("Confirm removal")}
            <Trash2 size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}
