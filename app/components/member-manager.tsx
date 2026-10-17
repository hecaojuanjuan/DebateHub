"use client";

import { useLanguage } from "./language-provider";

import { useState } from "react";
import type { JoinRequest, Member, State } from "@/lib/types";

type Props = {
  data: State;
  members: Member[] | null;
  requests: JoinRequest[] | null;
  busy: boolean;
  perform: (
    path: string,
    body: Record<string, unknown>,
    done?: (result: Record<string, any>) => void,
  ) => void;
  notify: (message: string) => void;
};
export default function MemberManager({
  data,
  members,
  requests,
  busy,
  perform,
  notify,
}: Props) {
  const { t, formatDate } = useLanguage();
  const [removing, setRemoving] = useState<Member | null>(null);
  const owner = data.viewer?.role === "owner";
  if (removing)
    return (
      <div className="management-confirm" role="alert">
        <strong>{t("Remove {name}?", { name: removing.nickname })}</strong>
        <p>
          {t(
            "They will lose community access. Their posts and votes remain. Rejoining requires admin approval.",
          )}
        </p>
        <div className="management-actions">
          <button
            className="button small dark"
            disabled={busy}
            onClick={() =>
              perform("members/remove", { userId: removing.id }, () => {
                setRemoving(null);
                notify(t("Member removed."));
              })
            }
          >
            {t("Confirm member removal")}
          </button>
          <button
            className="button small outline"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            {t("Cancel")}
          </button>
        </div>
      </div>
    );
  return (
    <>
      <h3 className="management-heading">
        {t("Pending requests")}
        <span>{requests?.length ?? "…"}</span>
      </h3>
      {requests?.length === 0 && (
        <p className="management-empty">{t("No pending requests.")}</p>
      )}
      {requests?.map((request) => (
        <div className="member-row" key={request.id}>
          <span className="mini-avatar">{request.nickname.slice(0, 1)}</span>
          <div className="member-info">
            <strong>{request.nickname}</strong>
            <small>
              {t("Requested to join · ")} {formatDate(request.createdAt)}
            </small>
          </div>
          <div className="management-actions">
            <button
              className="button small dark"
              disabled={busy}
              onClick={() =>
                perform(
                  "members/review",
                  { userId: request.id, decision: "approve" },
                  () => notify(t("Request approved.")),
                )
              }
            >
              {t("Approve")}
            </button>
            <button
              className="button small outline"
              disabled={busy}
              onClick={() =>
                perform(
                  "members/review",
                  { userId: request.id, decision: "reject" },
                  () => notify(t("Request declined.")),
                )
              }
            >
              {t("Decline")}
            </button>
          </div>
        </div>
      ))}
      <h3 className="management-heading">
        {t("All members")}
        <span>{members?.length ?? "…"}</span>
      </h3>
      {owner && (
        <p className="management-empty">
          {t(
            "To add an admin, find an existing member and choose “Make admin”.",
          )}
        </p>
      )}
      {!members && <p className="management-empty">{t("Loading members…")}</p>}
      {members?.map((member) => (
        <div className="member-row" key={member.id}>
          <span className="mini-avatar">{member.nickname.slice(0, 1)}</span>
          <div className="member-info">
            <strong>
              {member.nickname}
              {member.id === data.viewer?.id ? t(" (you)") : ""}
            </strong>
            <small>
              {member.role === "owner"
                ? t("Owner")
                : member.role === "admin"
                  ? t("Admin")
                  : t("Community member")}
            </small>
          </div>
          <div className="management-actions">
            {member.role === "owner" ? (
              <span className="owner-badge">{t("Owner")}</span>
            ) : (
              <>
                {owner && (
                  <button
                    className="button small outline"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        "members/role",
                        {
                          userId: member.id,
                          role: member.role === "admin" ? "member" : "admin",
                        },
                        () =>
                          notify(
                            member.role === "admin"
                              ? t("Admin permissions removed.")
                              : t(
                                  "Admin appointed. They can now publish and manage motions.",
                                ),
                          ),
                      )
                    }
                  >
                    {member.role === "admin"
                      ? t("Remove admin role")
                      : t("Make admin")}
                  </button>
                )}
                {member.id !== data.viewer?.id &&
                  (owner || member.role === "member") && (
                    <button
                      className="button small outline danger"
                      disabled={busy}
                      onClick={() => setRemoving(member)}
                    >
                      {t("Remove member")}
                    </button>
                  )}
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
