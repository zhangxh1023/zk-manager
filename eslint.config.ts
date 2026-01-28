import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint'; // 引入 TS 插件

export default [
  // 1. 加载 Vue 的推荐配置
  ...pluginVue.configs['flat/recommended'],

  // 2. 加载 TypeScript 的推荐配置
  ...tseslint.configs.recommended,

  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: vueParser, // 顶层解析器必须是 vue-eslint-parser
      parserOptions: {
        // 关键：告诉 vue-eslint-parser 使用 TS 解析器来处理脚本部分
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'vue/max-attributes-per-line': ['error', {
        'singleline': { 'max': 1 },
        'multiline': { 'max': 1 },
      }],
      'vue/html-closing-bracket-newline': ['error', {
        'singleline': 'never',
        'multiline': 'always',
      }],
      'vue/html-indent': ['error', 2],

      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],

      'quotes': 'off',
      '@/quotes': ['error', 'single'],

      'comma-dangle': 'off',
      '@/comma-dangle': ['error', 'always-multiline'],

      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'src/components/ui/**',
      'src-tauri/**',
    ],
  },
];