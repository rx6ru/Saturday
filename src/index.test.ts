import { buildProgram } from './index';

describe('CLI help', () => {
  test('top-level help includes workflow examples', () => {
    const program = buildProgram();
    const help = program.helpInformation();

    expect(help).toContain('Examples:');
    expect(help).toContain('satur-day init');
    expect(help).toContain('satur-day sync');
    expect(help).toContain('satur-day serve');
  });
});
