import { buildProgram } from './index';

describe('CLI help', () => {
  test('top-level help includes workflow examples', () => {
    const program = buildProgram();
    const help = program.helpInformation();

    expect(help).toContain('Examples:');
    expect(help).toContain('saturday init');
    expect(help).toContain('saturday sync');
    expect(help).toContain('saturday serve');
  });
});
