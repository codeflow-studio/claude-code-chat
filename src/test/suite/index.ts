import * as path from 'path';
import Mocha from 'mocha'; // Changed from `* as Mocha` to `Mocha` for proper constructor
import glob from 'glob'; // Changed from `* as glob` to `glob` for proper function call

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise<void>((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
      if (err) {
        return e(err);
      }

      // Add files to the test suite
      files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures: number) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        e(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}