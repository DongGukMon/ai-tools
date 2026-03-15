import type { CommitInfo } from "../../types";
import CommitListHeader from "./CommitListHeader";
import CommitListItem from "./CommitListItem";
import WorkingChanges from "./WorkingChanges";

interface Props {
  commits: CommitInfo[];
  changeCount: number;
  selectedView: "changes" | CommitInfo;
  onSelectView: (view: "changes" | CommitInfo) => void;
}

export default function CommitList({
  commits,
  changeCount,
  selectedView,
  onSelectView,
}: Props) {
  const isChangesSelected = selectedView === "changes";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <CommitListHeader />
      <div className="flex-1 overflow-y-auto">
        <WorkingChanges
          changeCount={changeCount}
          isSelected={isChangesSelected}
          onClick={() => onSelectView("changes")}
        />
        {commits.map((commit) => (
          <CommitListItem
            key={commit.hash}
            commit={commit}
            isSelected={
              selectedView !== "changes" && selectedView.hash === commit.hash
            }
            onClick={() => onSelectView(commit)}
          />
        ))}
      </div>
    </div>
  );
}
