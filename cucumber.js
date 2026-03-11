module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: [
      'src/tests/cucumber/support/env.setup.ts',
      'src/tests/cucumber/support/world.ts',
      'src/tests/cucumber/support/hooks.ts',
      'src/tests/cucumber/steps/**/*.ts',
    ],
    paths: ['src/tests/cucumber/features/**/*.feature'],
    format: [
      'progress-bar',
      'html:src/tests/cucumber/reports/cucumber-report.html',
    ],
    timeout: 60000,
    publishQuiet: true,
  },
};
