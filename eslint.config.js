import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // 忽略哪些文件/文件夹
  { ignores: ['dist', 'node_modules', 'build.cjs'] },

  // 基础规则
  {
    // 对 src 下的 ts/tsx 文件生效
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,           // JS 基础规则（禁止未使用变量等）
      ...tseslint.configs.recommended,   // TS 规则（禁止 any、类型检查等）
    ],
    plugins: {
      'react-hooks': reactHooks,         // React Hook 规则
      'react-refresh': reactRefresh,     // React Fast Refresh 兼容性检查
    },
    rules: {
      // ── React Hook 规则 ──
      ...reactHooks.configs.recommended.rules,
      // Hook 依赖数组是否完整（少写依赖会导致 stale closure bug）
      // 'react-hooks/exhaustive-deps': 'warn',   ← 已包含在 recommended 里

      // ── React Refresh ──
      // 确保组件能被热更新（开发时改代码不用刷新页面）
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── TypeScript 规则 ──
      // 禁止 any（但允许函数参数里偶尔用）
      '@typescript-eslint/no-explicit-any': 'warn',
      // 禁止未使用的变量（但允许 _ 开头的）
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // ── 通用规则 ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],  // 禁止 console.log（允许 warn/error）
      'eqeqeq': ['error', 'always'],                          // 强制 === 代替 ==
      'no-var': 'error',                                       // 禁止 var，用 let/const
      'prefer-const': 'error',                                 // 能用 const 就不用 let
    },
  },
);
