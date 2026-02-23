Hooks.once("ready", () => {
  console.log("Custom Defense Bonus system with button loaded");

  if (!game?.modules?.get("lib-wrapper")?.active) {
    ui.notifications.warn(
      "The 'libWrapper' module is required for Custom Defense Bonus to function correctly."
    );
    return;
  }

  // Hook para botão de dano na mensagem de resultado
  Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".damage-roll-btn").on("click", async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      const actorId = btn.dataset.actorId;
      const itemId = btn.dataset.itemId;

      const actor = game.actors.get(actorId);
      const item = actor?.items.get(itemId);
      if (!item) {
        ui.notifications.warn("Arma não encontrada para rolar dano.");
        return;
      }

      await item.rollDamage();
    });
  });

  // Monta HTML do dialog com radio buttons para cada combatente
  function buildTargetDialogContent(combatants) {
    const radios = combatants
      .map(
        (c, i) =>
          `<label style="display:block; margin:4px 0; cursor:pointer;">
            <input type="radio" name="target" value="${c.tokenId}" ${i === 0 ? "checked" : ""}/>
            ${c.name}
          </label>`
      )
      .join("");
    return `<form><p><strong>Escolha o alvo:</strong></p>${radios}</form>`;
  }

  // Wrapper do ataque
  libWrapper.register(
    "new-combat-system",
    "CONFIG.Item.documentClass.prototype.rollAttack",
    async function (wrapped, ...args) {
      console.log("Interceptando ataque", this);

      // Sem encounter ativo: ataque segue normalmente
      if (!game.combat) {
        return wrapped(...args);
      }

      // Identifica o token do atacante
      const attackerToken =
        canvas.tokens.controlled[0] ||
        canvas.tokens.placeables.find((t) => t.actor?.id === this.actor.id);

      // Coleta combatentes válidos (exclui o atacante, exige token no canvas)
      const validCombatants = game.combat.combatants
        .filter((c) => {
          const token = canvas.tokens.get(c.tokenId);
          if (!token) return false;
          if (attackerToken && token.id === attackerToken.id) return false;
          return true;
        })
        .map((c) => ({
          tokenId: c.tokenId,
          name: c.name,
        }));

      if (validCombatants.length === 0) {
        ui.notifications.warn("Nenhum alvo disponível no combate.");
        return null;
      }

      // Dialog de seleção de alvo
      const selectedTokenId = await Dialog.wait({
        title: "Escolha o Alvo",
        content: buildTargetDialogContent(validCombatants),
        buttons: {
          attack: {
            icon: '<i class="fas fa-crosshairs"></i>',
            label: "Atacar",
            callback: (html) => html.find('input[name="target"]:checked').val(),
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancelar",
            callback: () => null,
          },
        },
        default: "attack",
        close: () => null,
      });

      // Cancelou ou fechou: não ataca
      if (!selectedTokenId) return null;

      // Executa o ataque
      const attackRoll = await wrapped(...args);

      // Atacante cancelou o dialog de ataque
      if (!attackRoll) return null;

      // Rola defesa automaticamente
      const targetToken = canvas.tokens.get(selectedTokenId);
      if (!targetToken?.actor) return attackRoll;

      const targetActor = targetToken.actor;
      const defenseBonus = targetActor.system.attributes.ac.value - 10;
      const defenseRoll = await new Roll(`1d20 + ${defenseBonus}`).evaluate({async: true});

      // Compara resultado
      const hit = attackRoll.total >= defenseRoll.total;
      const resultText = hit ? "✅ O ataque <strong>ACERTOU</strong>!" : "❌ O ataque <strong>ERROU</strong>!";

      // Mensagem unificada com resultado e botão de dano
      const attackerName = this.actor.name;
      const content = `
        <div style="border:1px solid #999; border-radius:6px; padding:8px; margin:4px 0;">
          <p><strong>⚔️ ${attackerName} atacou ${targetActor.name}!</strong></p>
          <p>🎲 Ataque: <strong>${attackRoll.total}</strong> <span style="opacity:0.7">(${attackRoll.formula})</span></p>
          <p>🛡️ Defesa: <strong>${defenseRoll.total}</strong> <span style="opacity:0.7">(1d20 + ${defenseBonus})</span></p>
          <p>${resultText}</p>
          <button class="damage-roll-btn" data-actor-id="${this.actor.id}" data-item-id="${this.id}">🎲 Rolar Dano</button>
        </div>
      `;

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content,
      });

      return attackRoll;
    },
    "WRAPPER"
  );
});
