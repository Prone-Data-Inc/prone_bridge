-- Live updates for the risk checks. A payment is scored and held the moment it is made, and the AI's note for it arrives a
-- moment later. This signals every write of an assessment, so the admin's pages show the note as soon as it is there.
-- Same rule as the other signals: ids and status only, never a score, a name or an email.

create trigger risk_assessments_broadcast
  after insert or update on public.risk_assessments
  for each row execute function public.broadcast_change();
