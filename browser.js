// dsh-maplay browser half — hand-written, not emitted by tsc (see package.json
// exports["./client"]). Registers the "地图" view tab in the conversation view
// ring, gated on the maplay agent preset, and iframes the /maplay/playground
// page (SSE-animated from the in-process maplay session).
window.__ModuleLoader__.load({
  id: "dsh-maplay",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    exports.inject = ["slots"];

    exports.apply = function apply(ctx) {
      ctx.slots.inject("conversation.view", function () {
        return ctx.slots.register({
          name: "conversation.view",
          id: "maplay",
          order: 20,
          label: function label() { return "地图"; },
        }, MaplayView);
      });
    };

    function MaplayView(props) {
      var preset = props.useSessions(function select(state) {
        var summary = state.byId[props.sessionId];
        return summary === undefined ? undefined : summary.agentPreset;
      });
      if (preset !== "maplay") return null;
      return React.createElement("iframe", {
        src: "/maplay/playground",
        title: "maplay 地图",
        style: {
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "var(--dsw-alias-bg-base)",
        },
      });
    }

    return module.exports;
  }
});
