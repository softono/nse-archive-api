import { fetchNseArchive } from "@/fetch/nse-client";
import { archiveRawFile } from "@/lib/raw-archive";
import {
  parseParticipantActivityCsv,
  type ParticipantActivityRow,
} from "@/parse/participant-activity";

function ddmmyyyy(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}${m}${y}`;
}

/** Participant-wise open interest — confirmed available back to at least 2018. */
export async function fetchParticipantOi(
  tradeDate: string,
): Promise<{ rows: ParticipantActivityRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_${ddmmyyyy(tradeDate)}.csv`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_participant_oi",
    tradeDate,
    ext: "csv",
    data: buf,
  });
  return {
    rows: parseParticipantActivityCsv(buf.toString("utf-8")),
    archivedPath,
  };
}

/** Participant-wise trading volume — same file shape and availability as participant OI. */
export async function fetchParticipantVolume(
  tradeDate: string,
): Promise<{ rows: ParticipantActivityRow[]; archivedPath: string }> {
  const url = `https://nsearchives.nseindia.com/content/nsccl/fao_participant_vol_${ddmmyyyy(tradeDate)}.csv`;
  const buf = await fetchNseArchive(url);
  const archivedPath = await archiveRawFile({
    source: "nse_participant_vol",
    tradeDate,
    ext: "csv",
    data: buf,
  });
  return {
    rows: parseParticipantActivityCsv(buf.toString("utf-8")),
    archivedPath,
  };
}
