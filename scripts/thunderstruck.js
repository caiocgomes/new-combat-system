Hooks.once("ready", () => {
  console.log("⚡ Thunderstruck! Sistema de som de crítico carregado");

  // ========================================
  // CONFIGURAÇÃO - EDITE AQUI
  // ========================================
  const CONFIG_THUNDERSTRUCK = {
    // Nome do personagem que tem a arma de trovão
    playerName: "Nome do Personagem Aqui",

    // Caminho do arquivo de áudio (relativo à pasta do módulo)
    // Exemplo: "sounds/thunderstruck.mp3"
    audioPath: "sounds/thunderstruck.mp3",

    // Volume do som (0.0 a 1.0)
    volume: 0.7,

    // Verificar se o dano é de trovão? (true/false)
    // Se false, toca em qualquer crítico do jogador
    checkThunderDamage: true,

    // Palavra-chave para detectar dano de trovão
    // Procura por "thunder" ou "trovão" na descrição do dano
    thunderKeywords: ["thunder", "trovão", "lightning", "relâmpago"]
  };

  // ========================================
  // LÓGICA - NÃO PRECISA MEXER AQUI
  // ========================================

  // Hook para interceptar rolagens de ataque
  Hooks.on("dnd5e.rollAttack", (item, roll) => {
    // Verifica se foi crítico
    if (!roll.isCritical) return;

    const actor = item.actor;
    if (!actor) return;

    // Verifica se é o jogador configurado
    if (actor.name !== CONFIG_THUNDERSTRUCK.playerName) return;

    console.log(`⚡ Crítico detectado de ${actor.name}!`);

    // Se não precisa verificar dano de trovão, já toca
    if (!CONFIG_THUNDERSTRUCK.checkThunderDamage) {
      playThunderstruck();
      return;
    }

    // Verifica se o item tem dano de trovão
    const hasThunderDamage = checkForThunderDamage(item);

    if (hasThunderDamage) {
      console.log("⚡⚡⚡ THUNDERSTRUCK! ⚡⚡⚡");
      playThunderstruck();
    }
  });

  function checkForThunderDamage(item) {
    // Verifica nos dados do item
    const damageTypes = item.system?.damage?.parts || [];

    for (const [formula, type] of damageTypes) {
      // Verifica se o tipo de dano contém alguma palavra-chave
      const typeStr = (type || "").toLowerCase();
      const isThunder = CONFIG_THUNDERSTRUCK.thunderKeywords.some(
        keyword => typeStr.includes(keyword.toLowerCase())
      );

      if (isThunder) {
        return true;
      }
    }

    // Também verifica no nome e descrição do item
    const itemName = (item.name || "").toLowerCase();
    const itemDesc = (item.system?.description?.value || "").toLowerCase();
    const searchText = itemName + " " + itemDesc;

    return CONFIG_THUNDERSTRUCK.thunderKeywords.some(
      keyword => searchText.includes(keyword.toLowerCase())
    );
  }

  function playThunderstruck() {
    const audioPath = CONFIG_THUNDERSTRUCK.audioPath;
    const volume = CONFIG_THUNDERSTRUCK.volume;

    // Tenta tocar o áudio
    try {
      AudioHelper.play({
        src: audioPath,
        volume: volume,
        autoplay: true,
        loop: false
      }, true); // true = toca para todos os jogadores

      // Mensagem no chat (opcional, mas divertido)
      ChatMessage.create({
        content: `<div style="text-align: center; font-size: 20px; color: #FFD700;">
          ⚡⚡⚡ <strong>THUNDERSTRUCK!</strong> ⚡⚡⚡
        </div>`,
        whisper: [] // Envia para todos
      });

    } catch (error) {
      console.error("Erro ao tocar Thunderstruck:", error);
      ui.notifications.warn("Não foi possível tocar o som de Thunderstruck. Verifique o caminho do arquivo.");
    }
  }
});
