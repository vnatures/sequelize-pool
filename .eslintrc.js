module.exports = {
  "rules": {
    "strict": [
      "warn",
      "global"
    ],
    "no-var": "off",
    "prefer-const": "off",
    "semi": [
      "error",
      "always"
    ],
    "no-caller": "error",
    "no-undef": "error",
    "no-unused-vars": "error",
    "no-irregular-whitespace": "error"
  },
  "extends": ["plugin:prettier/recommended"],
  "parserOptions": {
    "ecmaVersion": 6
  },
  "env": {
    "node": true,
    "es6": true
  }
};