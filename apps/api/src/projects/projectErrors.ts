export class ProjectNameTakenError extends Error {
  constructor(message = 'Project name already taken') {
    super(message);
    this.name = 'ProjectNameTakenError';
  }
}

export class ProjectIdentifierTakenError extends Error {
  constructor(message = 'Project identifier already taken') {
    super(message);
    this.name = 'ProjectIdentifierTakenError';
  }
}
