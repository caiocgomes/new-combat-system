# 🎵 Pasta de Áudios

Coloque aqui os arquivos de áudio que serão tocados durante o jogo.

## Thunderstruck

Para usar o efeito sonoro de "Thunderstruck":

1. Coloque o arquivo MP3 do Brian Johnson falando "I've been... Thunderstruck" nesta pasta
2. Renomeie o arquivo para `thunderstruck.mp3` (ou edite o caminho no script)
3. Abra o arquivo `scripts/thunderstruck.js`
4. Edite a configuração no topo do arquivo:

```javascript
const CONFIG_THUNDERSTRUCK = {
  playerName: "Nome do Personagem Aqui",  // ← EDITE AQUI
  weaponName: "Nome da Arma Aqui",        // ← E AQUI
  audioPath: "sounds/thunderstruck.mp3",
  volume: 0.7
};
```

5. Substitua `"Nome do Personagem Aqui"` pelo nome exato do personagem no Foundry
6. Substitua `"Nome da Arma Aqui"` pelo nome exato da arma no inventário

**Pronto!** Agora toda vez que esse personagem rolar um crítico com essa arma específica, o som vai tocar para todos os jogadores! ⚡
