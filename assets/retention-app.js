NW.bootPage(function (view) {
  NW.renderKpis(view);
  NW.renderChurnChart(view);
  NW.renderPositionFlow(view);
  NW.renderAtRisk(view);
  NW.renderCohortSurvival(view);
  NW.renderRetentionMatrix(view);
});
