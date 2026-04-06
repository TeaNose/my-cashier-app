export type Theme = {
  text: string;
  background: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  inputBackground: string;
  inputBorder: string;
};

const Colors: { light: Theme; dark: Theme } = {
  light: {
    text: '#000',
    background: '#fff',
    tint: '#2f95dc',
    tabIconDefault: '#ccc',
    tabIconSelected: '#2f95dc',
    inputBackground: '#f2f2f7',
    inputBorder: '#c6c6c8',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: '#fff',
    tabIconDefault: '#ccc',
    tabIconSelected: '#fff',
    inputBackground: '#1c1c1e',
    inputBorder: '#38383a',
  },
};

export default Colors;
