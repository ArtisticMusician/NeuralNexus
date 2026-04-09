export class ReplacementAuditFake {
  private logs: any[] = [];
  async initialize() {}
  async logReplacement(record: any) {
    this.logs.push(record);
  }
  async getLogs(limit: number = 50) {
    return [...this.logs].reverse().slice(0, limit);
  }
  async close() {}
}
