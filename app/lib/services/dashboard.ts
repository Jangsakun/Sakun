export async function getAdminSummary() {
  return {
    checkedInCount: 0,
    notCheckedOutCount: 0,
    contractCreatedTodayCount: 0,
  };
}