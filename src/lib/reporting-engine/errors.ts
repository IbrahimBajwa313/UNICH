export class ReportNotFoundError extends Error {
  constructor(id: string) {
    super(`Unknown report "${id}".`);
    this.name = "ReportNotFoundError";
  }
}

export class ReportAccessDeniedError extends Error {
  constructor(id: string) {
    super(`Not permitted to view report "${id}".`);
    this.name = "ReportAccessDeniedError";
  }
}
