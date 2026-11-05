// Ported to Foundry 14 and dnd5e 6: attacks now live on activities, not items.
Hooks.once("init", () => {
  game.settings.register("new-combat-system", "filterByRange", {
    name: "Filter targets by weapon range",
    hint: "Only show targets within weapon range in the target selection dialog. Targets beyond normal range but within long range are marked with disadvantage.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // Botão de dano na mensagem de resultado
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const btn of html.querySelectorAll(".damage-roll-btn")) {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const { actorId, itemId, activityId, critical } = btn.dataset;
        const item = game.actors.get(actorId)?.items.get(itemId);
        if (!item) {
          ui.notifications.warn("Arma não encontrada para rolar dano.");
          return;
        }
        const activity = item.system.activities?.get(activityId)
          ?? item.system.activities?.getByType("attack")?.[0];
        if (!activity?.rollDamage) {
          ui.notifications.warn("Ataque não encontrado para rolar dano.");
          return;
        }
        await activity.rollDamage({ event, isCritical: critical === "true" });
      });
    }
  });
});

Hooks.once("ready", () => {
  console.log("Custom Defense Bonus system with button loaded");

  if (!game?.modules?.get("lib-wrapper")?.active) {
    ui.notifications.warn(
      "The 'libWrapper' module is required for Custom Defense Bonus to function correctly."
    );
    return;
  }

  // Centros dos quadrados ocupados pelo token. getOccupiedGridSpaceOffsets repete
  // cada quadrado por nível de profundidade, por isso a deduplicação em i,j.
  function getOccupiedPoints(token) {
    const cells = new Map();
    for (const offset of token.document.getOccupiedGridSpaceOffsets()) {
      const key = `${offset.i},${offset.j}`;
      if (cells.has(key)) continue;
      const { x, y } = canvas.grid.getCenterPoint(offset);
      cells.set(key, { x, y });
    }
    return cells.size ? [...cells.values()] : [token.center];
  }

  // Distância entre os quadrados mais próximos, para que tokens grandes possam ser
  // atacados a partir da borda. Medir de centro a centro exigia estar sobre o alvo.
  function getGridDistance(tokenA, tokenB) {
    let min = Infinity;
    for (const a of getOccupiedPoints(tokenA)) {
      for (const b of getOccupiedPoints(tokenB)) {
        min = Math.min(min, canvas.grid.measurePath([a, b]).distance);
      }
    }
    return min;
  }

  function getAttackRange(activity) {
    const weapon = activity.item.system.range ?? {};
    const own = activity.range ?? {};
    // Armas guardam alcance no item, a não ser que a atividade o substitua; magias usam a atividade
    const source = activity.item.type === "weapon" && !own.override ? weapon : own;
    const reach = weapon.reach || own.reach || 0;
    const normal = source.value || reach || 5;
    const long = source.long && source.long > normal ? source.long : null;
    return { normal: Math.max(normal, reach), long };
  }

  function buildTargetDialogContent(combatants) {
    const radios = combatants
      .map((c, i) => {
        const distLabel = `(${Math.round(c.distance)}ft)`;
        const disadvLabel = c.disadvantage ? ' <span style="color:#e74c3c; font-weight:bold;">⚠️ desvantagem</span>' : "";
        return `<label style="display:block; margin:4px 0; cursor:pointer;">
            <input type="radio" name="target" value="${c.tokenId}" ${i === 0 ? "checked" : ""}/>
            ${foundry.utils.escapeHTML(c.name)} <span style="opacity:0.7">${distLabel}</span>${disadvLabel}
          </label>`;
      })
      .join("");
    return `<p><strong>Escolha o alvo:</strong></p>${radios}`;
  }

  // Wrapper do ataque
  libWrapper.register(
    "new-combat-system",
    "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack",
    async function (wrapped, ...args) {
      console.log("Interceptando ataque", this);

      // Sem encounter ativo ou sem cena: ataque segue normalmente
      if (!game.combat || !canvas?.ready) {
        return wrapped(...args);
      }

      // Identifica o token do atacante
      const attackerToken =
        canvas.tokens.controlled[0] ||
        canvas.tokens.placeables.find((t) => t.actor?.id === this.actor.id);

      const filterByRange = game.settings.get("new-combat-system", "filterByRange");
      const attackRange = getAttackRange(this);
      const maxRange = attackRange.long || attackRange.normal;

      // Coleta combatentes válidos (exclui o atacante, exige token no canvas)
      let validCombatants = game.combat.combatants
        .filter((c) => {
          const token = canvas.tokens.get(c.tokenId);
          if (!token) return false;
          if (attackerToken && token.id === attackerToken.id) return false;
          return true;
        })
        .map((c) => {
          const token = canvas.tokens.get(c.tokenId);
          const distance = attackerToken ? getGridDistance(attackerToken, token) : 0;
          const disadvantage = attackRange.long ? distance > attackRange.normal && distance <= attackRange.long : false;
          return { tokenId: c.tokenId, name: c.name, distance, disadvantage };
        });

      if (filterByRange && attackerToken) {
        validCombatants = validCombatants.filter((c) => c.distance <= maxRange);
      }

      if (validCombatants.length === 0) {
        ui.notifications.warn(filterByRange ? "Nenhum alvo ao alcance." : "Nenhum alvo disponível no combate.");
        return null;
      }

      // Dialog de seleção de alvo
      const selectedTokenId = await foundry.applications.api.DialogV2.wait({
        window: { title: "Escolha o Alvo" },
        content: buildTargetDialogContent(validCombatants),
        buttons: [
          {
            action: "attack",
            icon: "fa-solid fa-crosshairs",
            label: "Atacar",
            default: true,
            callback: (event, button) => button.form.elements.target?.value
              ?? button.form.querySelector('input[name="target"]:checked')?.value ?? null,
          },
          {
            action: "cancel",
            icon: "fa-solid fa-xmark",
            label: "Cancelar",
            callback: () => null,
          },
        ],
        rejectClose: false,
      });

      // Cancelou ou fechou: não ataca
      if (!selectedTokenId || selectedTokenId === "cancel") return null;

      // Executa o ataque
      const attackRolls = await wrapped(...args);

      // Atacante cancelou o dialog de ataque
      const attackRoll = attackRolls?.[0];
      if (!attackRoll) return attackRolls ?? null;

      // Rola defesa automaticamente
      const targetToken = canvas.tokens.get(selectedTokenId);
      if (!targetToken?.actor) return attackRolls;

      const targetActor = targetToken.actor;
      const defenseBonus = targetActor.system.attributes.ac.value - 10;
      const defenseRoll = await new Roll(`1d20 + ${defenseBonus}`).evaluate();

      // Compara resultado
      const hit = attackRoll.total >= defenseRoll.total;
      const resultText = hit ? "✅ O ataque <strong>ACERTOU</strong>!" : "❌ O ataque <strong>ERROU</strong>!";

      // Mensagem unificada com resultado e botão de dano
      const attackerName = foundry.utils.escapeHTML(this.actor.name);
      const targetName = foundry.utils.escapeHTML(targetActor.name);
      const content = `
        <div style="border:1px solid #999; border-radius:6px; padding:8px; margin:4px 0;">
          <p><strong>⚔️ ${attackerName} atacou ${targetName}!</strong></p>
          <p>🎲 Ataque: <strong>${attackRoll.total}</strong> <span style="opacity:0.7">(${attackRoll.formula})</span></p>
          <p>🛡️ Defesa: <strong>${defenseRoll.total}</strong> <span style="opacity:0.7">(1d20 + ${defenseBonus})</span></p>
          <p>${resultText}</p>
          <button type="button" class="damage-roll-btn" data-actor-id="${this.actor.id}" data-item-id="${this.item.id}" data-activity-id="${this.id}" data-critical="${attackRoll.isCritical === true}">🎲 Rolar Dano</button>
        </div>
      `;

      await ChatMessage.create({
        author: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content,
      });

      return attackRolls;
    },
    "MIXED"
  );
});
