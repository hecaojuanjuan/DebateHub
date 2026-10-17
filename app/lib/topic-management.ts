import { ApiError, one, requireTopic, run, text, type Row } from "./server";

export async function manageTopic(path: string, cid: string, b: Row) {
  const topicId = text(b.topicId, "辩题标识", 1, 80);
  const topic = await requireTopic(topicId, cid);
  if (path === "topics/withdraw") {
    if (typeof b.withdrawn !== "boolean")
      throw new ApiError(400, "请选择撤回或恢复辩题");
    await run(
      "UPDATE topics SET withdrawn=?,updated_at=? WHERE id=? AND community_id=?",
      b.withdrawn ? 1 : 0,
      Date.now(),
      topicId,
      cid,
    );
    return;
  }
  const proLabel = text(b.proLabel ?? topic.pro_label, "正方立场", 2, 80);
  const conLabel = text(b.conLabel ?? topic.con_label, "反方立场", 2, 80);
  if (
    (proLabel !== topic.pro_label || conLabel !== topic.con_label) &&
    (await one(
      "SELECT 1 FROM votes WHERE topic_id=? UNION ALL SELECT 1 FROM comments WHERE topic_id=? LIMIT 1",
      topicId,
      topicId,
    ))
  )
    throw new ApiError(
      409,
      "已有成员参与，不能更改双方立场名称；可撤回后发布新的辩题",
    );
  const result = await run(
    "UPDATE topics SET title=?,description=?,pro_label=?,con_label=?,category=?,updated_at=? WHERE id=? AND community_id=? AND ((pro_label=? AND con_label=?) OR (NOT EXISTS (SELECT 1 FROM votes WHERE topic_id=?) AND NOT EXISTS (SELECT 1 FROM comments WHERE topic_id=?)))",
    text(b.title, "辩题", 5, 120),
    text(b.description, "背景介绍", 5, 3000),
    proLabel,
    conLabel,
    text(b.category || "每周训练", "分类", 2, 20),
    Date.now(),
    topicId,
    cid,
    proLabel,
    conLabel,
    topicId,
    topicId,
  );
  if (!result.meta.changes)
    throw new ApiError(409, "辩题参与情况已变化，请刷新后再编辑");
}
