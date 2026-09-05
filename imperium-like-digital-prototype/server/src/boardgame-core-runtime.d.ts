declare module "boardgame.io/core" {
  export const INVALID_MOVE: "INVALID_MOVE";
  export const TurnOrder: {
    CUSTOM_FROM: (field: string) => any;
  };
}
