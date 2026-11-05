// Ported to Foundry 14 and dnd5e 6: the critical flag is now options.isCritical.
Hooks.once("ready", () => {
  if (!game.modules.get("lib-wrapper")?.active) {
    ui.notifications.warn("libWrapper é necessário.");
    return;
  }

  libWrapper.register("new-combat-system", "CONFIG.Dice.DamageRoll.prototype.evaluate", function (wrapped, options) {
    // Rolagem de dano crítica: reescreve a fórmula antes de avaliar.
    // options.garenCrit evita reescrever de novo quando a rolagem é clonada ou rerolada.
    if (this.isCritical && !this._evaluated && !this.options.garenCrit) {
      const newFormula = rewriteCriticalFormula(this.formula);
      if (newFormula !== this.formula) {
        this.terms = this.constructor.parse(newFormula, this.data);
        this.resetFormula();
      }
      this.options.garenCrit = true;
    }
    return wrapped(options);
  }, "WRAPPER");
});

// 4d6 + 3 → 2d6 + 12 + 3. Quantidades ímpares e dados com modificadores não mudam.
function rewriteCriticalFormula(formula) {
  return formula.replace(/(?<![\w.@])(\d+)d(\d+)(?![\w.])(\[[^\]]*\])?/g, (full, qtdStr, facesStr, flavor = "") => {
    const qtd = Number(qtdStr);
    const faces = Number(facesStr);
    if (qtd % 2 !== 0) return full;
    const half = qtd / 2;
    return `${half}d${faces}${flavor} + ${half * faces}${flavor}`;
  });
}
