// Lint for the browser app (src/) and the code it shares with the server.
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended', 'prettier'],
  rules: {
    // The app does not use prop-types; props are documented where they are read.
    'react/prop-types': 'off',
    // JSX compiles to the automatic runtime: React need not be in scope.
    'react/react-in-jsx-scope': 'off',
    // Apostrophes in prose are fine as they are.
    'react/no-unescaped-entities': 'off',
    // Hooks keyed on an id (user?.id) rather than the object are deliberate
    // here; the rules of hooks themselves stay errors.
    'react-hooks/exhaustive-deps': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    'no-empty': ['error', { allowEmptyCatch: true }]
  },
  ignorePatterns: ['dist/', 'public/', 'node_modules/']
};
