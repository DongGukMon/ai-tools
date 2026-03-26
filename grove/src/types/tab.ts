export type AppTabType = "terminal" | "changes" | "browser";

export interface AppTab {
  id: string;
  type: AppTabType;
  title: string;
  closable: boolean;
}
