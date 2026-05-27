const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-env": {
      stage: 0,
      features: {
        "lab-function":   [true, { preserve: false }],
        "oklab-function": [true, { preserve: false }],
        "color-function": [true, { preserve: false }],
        "color-mix":      [true, { preserve: false }],
      },
    },
  },
};

export default config;
