/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 设计 token：来源于高保真原型 v0.2
      // 颜色体系：温暖纸感底色 + 品牌绿 + 暖橙强调
      colors: {
        // 背景层
        bg: '#F6F3EC',
        surface: '#FFFDF8',
        'surface-2': '#F1EEE7',
        'surface-3': '#E8E2D7',
        // 文字层
        ink: '#24221E',
        muted: '#746E63',
        subtle: '#9E9588',
        line: '#DDD6C9',
        // 品牌色
        brand: {
          DEFAULT: '#4E6E5D',
          dark: '#314D41',
          soft: '#E6EFE8',
        },
        // 强调色
        accent: {
          DEFAULT: '#B7784B',
          soft: '#F2E2D3',
        },
        // 功能色
        info: {
          DEFAULT: '#526B8D',
          soft: '#E7ECF4',
        },
        purple: {
          DEFAULT: '#75639A',
          soft: '#EEE9F8',
        },
        danger: {
          DEFAULT: '#A4554B',
          soft: '#F5E6E3',
        },
        warning: {
          DEFAULT: '#B7784B',
          soft: '#F2E2D3',
        },
        success: {
          DEFAULT: '#4E6E5D',
          soft: '#E6EFE8',
        },
      },
      // 圆角
      borderRadius: {
        xl: '28px',
        lg: '22px',
        md: '15px',
      },
      // 阴影
      boxShadow: {
        soft: '0 8px 26px rgba(56,47,35,.08)',
        card: '0 18px 50px rgba(56,47,35,.14)',
      },
      // 字体
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      // 间距（在 Tailwind 默认基础上无需扩展，使用默认 4px 基准）
      // 字号
      fontSize: {
        // 适配桌面客户端的字号梯度
        '2xl': ['28px', { lineHeight: '1.15', letterSpacing: '-0.04em', fontWeight: '840' }],
        xl: ['21px', { lineHeight: '1.2', letterSpacing: '-0.03em', fontWeight: '800' }],
        'lg-medium': ['15px', { lineHeight: '1.4', fontWeight: '780' }],
      },
    },
  },
  plugins: [],
}
