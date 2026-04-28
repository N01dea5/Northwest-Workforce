// Client fatigue rule configuration for Northwest Workforce.
// Rules are intentionally data-driven so the compliance view can show the
// controlling requirement and required action without hard-coding one global limit.

window.NW = window.NW || {};

(function (NW) {
  NW.FATIGUE_STATUS = {
    ok: "ok",
    watch: "watch",
    approvalRequired: "approvalRequired",
    standDownRequired: "standDownRequired",
    breach: "breach",
  };

  NW.FATIGUE_RULES = {
    "Fortescue": {
      maxShiftHours: 12.5,
      maxContinuousHoursTrigger: 14,
      minRestAfterCalloutHours: 10,
      approvalAuthority: "Fortescue SSE",
      requiresRCATForRosterChange: true,
      faidTriggers: [
        "Shift > 12.5h",
        "Shift starts before 05:00",
        "Split shift",
        "Permanent new roster",
        "Permanent roster change",
      ],
      requiredEvidence: ["RCAT where roster changes", "FAID where triggered", "SSE approval over 14 continuous hours"],
    },

    "Rio Tinto": {
      maxShiftHours: 12.5,
      dayShiftStartWindow: "05:30-06:30",
      nightShiftStartWindow: "17:30-18:30",
      maxMonthlyHoursFifoShutdown: 243,
      maxMonthlyHoursResidentialShutdown: 208,
      maxConsecutiveFifoShifts: 14,
      maxConsecutiveResidentialShifts: 10,
      maxConsecutiveFifoNightShiftsStandard: 7,
      maxConsecutiveFifoNightShiftsException: 10,
      maxConsecutiveResidentialNightShifts: 7,
      nightShiftRestAfter2To3NightsHours: 48,
      nightShiftRestAfter4To7Nights: "2:1 work:rest ratio",
      continuousWorkMaxHours: 5.5,
      minBreaksForLongShiftMinutes: 60,
      exceptionApproval: "Level 2 fatigue risk assessment + General Manager sign-off",
      extendedNightControls: [
        "Minimum 2 early finishes at 03:00",
        "Bus-only commute from village to site",
        "No solo self-driving",
        "Night-shift rooms protected from disruption",
        "Reduce high-risk work between 02:00 and 06:00",
        "Fatigue checks at shift start and during 02:00-06:00",
        "Commute plan for high-risk travel",
      ],
    },

    "BHP": {
      maxNormalShiftHours: 12,
      maxWorkHoursPer24hIncludingTravelAndHandover: 14,
      maxShiftHandoverMinutes: 30,
      minRestBetweenShiftsHours: 10,
      minimumSleepOpportunityHours: 7,
      maxHoursIn21ConsecutiveDays: 230,
      maxConsecutiveFifoShifts: 14,
      maxConsecutiveResidentialShifts: 8,
      maxConsecutiveFifoNightShifts: 7,
      minBreakBetweenDayAndNightShiftHours: 22,
      rnrMinimumRatioForRosterLength6Plus: 0.5,
      preferredRotation: "Forward rotation; day before night",
      requiredEvidence: ["Roster deviation risk assessment", "Approved roster deviation process", "Individual commute plan where required"],
    },

    "Roy Hill/Hancock": {
      maxConsecutiveDaysOnSite: 21,
      mandatoryDayShiftStandDownAfterConsecutiveDayShifts: 14,
      maxAdditionalDaysAfterDayShiftStandDown: 7,
      maxConsecutiveNightShiftsBeforeStandDown: 10,
      mandatoryNightShiftStandDownHours: 24,
      maxAdditionalNightShiftsAfterStandDown: 10,
      partialShiftDoesNotResetStandDown: true,
      requiredEvidence: [
        "Formal fatigue management approach submitted",
        "Individual risk assessment after night-shift stand-down",
        "Fatigue checklist each remaining shift after night-shift stand-down",
        "Supervisor fit-for-work confirmation each shift",
        "Pre-shutdown preparation stand-down where applicable",
      ],
    },
  };

  NW.fatigueStatusRank = function (status) {
    return { ok: 0, watch: 1, approvalRequired: 2, standDownRequired: 3, breach: 4 }[status] || 0;
  };

  NW.fatigueStatusLabel = function (status) {
    return {
      ok: "OK",
      watch: "Watch",
      approvalRequired: "Approval required",
      standDownRequired: "Stand-down required",
      breach: "Breach",
    }[status] || status;
  };

  NW.fatigueBadgeClass = function (status) {
    return {
      ok: "ok",
      watch: "warn",
      approvalRequired: "warn",
      standDownRequired: "risk",
      breach: "risk",
    }[status] || "";
  };
})(window.NW);
