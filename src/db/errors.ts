// D1の重複エラー（一意インデックスはSQLITE_CONSTRAINT_UNIQUE、主キーはSQLITE_CONSTRAINT_PRIMARYKEY）を判別する。
// targetはメッセージ中の`<テーブル>.<列>`（複合キーは`, `区切り）。Drizzle経由ではcauseに元のエラーが入る。
export const isDuplicateKeyError = (error: unknown, target: string): boolean => {
  for (let current = error; current instanceof Error; current = current.cause) {
    const { message } = current
    if (
      message.includes(`UNIQUE constraint failed: ${target}:`) &&
      /SQLITE_CONSTRAINT_(?:UNIQUE|PRIMARYKEY)\b/.test(message)
    ) {
      return true
    }
  }
  return false
}
