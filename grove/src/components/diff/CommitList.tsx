import type { CommitInfo } from "../../types";
import CommitListHeader from "./CommitListHeader";
import CommitListItem from "./CommitListItem";
import WorkingChanges from "./WorkingChanges";

interface Props {
  commits: CommitInfo[];
  selectedView: "changes" | CommitInfo;
  onSelectView: (view: "changes" | CommitInfo) => void;
}

export default function CommitList({
  commits,
  selectedView,
  onSelectView,
}: Props) {
  const isChangesSelected = selectedView === "changes";

  return (
    <div className="border-b border-border shrink-0">
      <CommitListHeader />
      <div className="max-h-[200px] overflow-y-auto">
        <WorkingChanges
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
