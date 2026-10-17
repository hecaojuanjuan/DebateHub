"use client";

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
  const [removing, setRemoving] = useState<Member | null>(null);
  const owner = data.viewer?.role === "owner";
  if (removing)
    return (
      <div className="management-confirm" role="alert">
        <strong>移出「{removing.nickname}」？</strong>
        <p>
          对方将失去社区访问权限，历史发言和投票保留。再次加入需管理员审核。
        </p>
        <div className="management-actions">
          <button
            className="button small dark"
            disabled={busy}
            onClick={() =>
              perform("members/remove", { userId: removing.id }, () => {
                setRemoving(null);
                notify("已移出成员");
              })
            }
          >
            确认移出
          </button>
          <button
            className="button small outline"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            取消
          </button>
        </div>
      </div>
    );
  return (
    <>
      <h3 className="management-heading">
        待审核申请 <span>{requests?.length ?? "…"}</span>
      </h3>
      {requests?.length === 0 && (
        <p className="management-empty">暂无待审核申请。</p>
      )}
      {requests?.map((request) => (
        <div className="member-row" key={request.id}>
          <span className="mini-avatar">{request.nickname.slice(0, 1)}</span>
          <div className="member-info">
            <strong>{request.nickname}</strong>
            <small>
              申请加入 ·{" "}
              {new Date(request.createdAt).toLocaleDateString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
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
                  () => notify("已同意加入社区"),
                )
              }
            >
              同意
            </button>
            <button
              className="button small outline"
              disabled={busy}
              onClick={() =>
                perform(
                  "members/review",
                  { userId: request.id, decision: "reject" },
                  () => notify("已拒绝这次申请"),
                )
              }
            >
              拒绝
            </button>
          </div>
        </div>
      ))}
      <h3 className="management-heading">
        全部成员 <span>{members?.length ?? "…"}</span>
      </h3>
      {owner && (
        <p className="management-empty">
          添加管理员：找到已加入的成员，点击右侧「设为管理员」。
        </p>
      )}
      {!members && <p className="management-empty">正在加载成员…</p>}
      {members?.map((member) => (
        <div className="member-row" key={member.id}>
          <span className="mini-avatar">{member.nickname.slice(0, 1)}</span>
          <div className="member-info">
            <strong>
              {member.nickname}
              {member.id === data.viewer?.id ? "（你）" : ""}
            </strong>
            <small>
              {member.role === "owner"
                ? "群主"
                : member.role === "admin"
                  ? "管理员"
                  : "社群成员"}
            </small>
          </div>
          <div className="management-actions">
            {member.role === "owner" ? (
              <span className="owner-badge">群主</span>
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
                              ? "已撤销管理员权限"
                              : "已设为管理员，可发布与管理辩题",
                          ),
                      )
                    }
                  >
                    {member.role === "admin" ? "撤销管理员" : "设为管理员"}
                  </button>
                )}
                {member.id !== data.viewer?.id &&
                  (owner || member.role === "member") && (
                    <button
                      className="button small outline danger"
                      disabled={busy}
                      onClick={() => setRemoving(member)}
                    >
                      移出
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
