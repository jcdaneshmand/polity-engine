export const PRIVATE_CARD_DEBUG_FLAG = "VITE_SHOW_PRIVATE_CARD_DEBUG";

export const isPrivateCardDebugEnabled =
  import.meta.env[PRIVATE_CARD_DEBUG_FLAG] === "true";
