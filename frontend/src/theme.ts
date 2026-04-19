export const theme = {
  colors: {
    bg: "#F9F8F6",
    surface: "#F2EFEA",
    surfaceElevated: "#FFFFFF",
    text: "#2C2A29",
    textMuted: "#787672",
    textInverse: "#F9F8F6",
    primary: "#1E3F32",
    primaryHover: "#2A5243",
    primaryLight: "#DCE6E1",
    expense: "#C85A40",
    income: "#4A7059",
    border: "#E3DFD7",
    accentSand: "#D4A574",
    accentMoss: "#6B8E7F",
    accentPlum: "#A55A7E",
    accentSky: "#5A8A9C",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  font: {
    display: "System",
    body: "System",
  },
  shadow: {
    soft: {
      shadowColor: "#2C2A29",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 30,
      elevation: 2,
    },
    card: {
      shadowColor: "#2C2A29",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 3,
    },
  },
};

export const formatCurrency = (n: number, currency = "USD") => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${sign}${symbol}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
