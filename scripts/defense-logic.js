Hooks.once("ready", () => {
  console.log("Custom Defense Bonus system with button loaded");

  if (!game?.modules?.get("lib-wrapper")?.active) {
    ui.notifications.warn(
      "The 'libWrapper' module is required for Custom Defense Bonus to function correctly."
    );
    return;
  }

  // Hook global – só registra uma vez
  Hooks.on("renderChatMessage", (message, html, data) => {
    html.find(".defense-roll").on("click", async (event) => {
      event.preventDefault();

      const messageId = event.currentTarget.dataset.messageId;
      console.log("Botão clicado!", messageId);

      const chatMessage = game.messages.get(messageId);
      if (!chatMessage) return;

      const actor = ChatMessage.getSpeakerActor(chatMessage.speaker);
      if (!actor) {
        ui.notifications.warn(
          "Ator não encontrado para esta rolagem de defesa."
        );
        return;
      }

      const defenseBonus = actor.system.attributes.ac.value - 10;
      const formula = `1d20 + ${defenseBonus}`;

      await dnd5e.dice.d20Roll({
        actor,
        data: actor.getRollData(),
        parts: [defenseBonus],
        title: `🛡️ Defesa Ativa de ${actor.name}`,
        flavor: `🛡️ Defesa Ativa de <strong>${actor.name}</strong>`,
        fastForward: false,
        rollMode: game.settings.get("core", "rollMode"),
      });

      console.log(`Rolando defesa para ${actor.name}`);
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

      // Cria botão de defesa para o alvo selecionado
      const targetToken = canvas.tokens.get(selectedTokenId);
      if (targetToken?.actor) {
        const targetActor = targetToken.actor;

        const message = await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          content: `<button class="defense-roll" data-message-id="PLACEHOLDER">🎯 Rolar Defesa</button>`,
        });

        const updatedContent = message.content.replace(
          "PLACEHOLDER",
          message.id
        );
        await message.update({ content: updatedContent });
      }

      return attackRoll;
    },
    "WRAPPER"
  );
});
