module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Nueva funcionalidad
        'fix',      // Corrección de bug
        'docs',     // Documentación
        'style',    // Formato, estilos (sin cambios de código)
        'refactor', // Refactorización
        'perf',     // Mejoras de rendimiento
        'test',     // Tests
        'build',    // Build system
        'ci',       // CI/CD
        'chore',    // Mantenimiento
        'revert',   // Revert de commit
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
}
