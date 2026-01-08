(function(){
  const state = {
    panel: "log",
  };

  const subs = new Set();

  function getState(){ return state; }

  function setState(patch, reason="setState"){
    Object.assign(state, (typeof patch === "function" ? patch(state) : patch));
    subs.forEach(fn => fn(state, reason));
  }

  function subscribe(fn){
    subs.add(fn);
    return () => subs.delete(fn);
  }

  window.DASH_STATE = { getState, setState, subscribe };
})();