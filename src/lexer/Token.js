export class Token {
  constructor(type, lexeme, literal, location) {
    this.type = type
    this.lexeme = lexeme
    this.literal = literal
    this.location = location
  }

  is(type, lexeme = null) {
    return this.type === type && (lexeme === null || this.lexeme === lexeme)
  }
}
