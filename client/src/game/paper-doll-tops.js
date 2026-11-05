import { getPaperDollTop } from '../../../shared/paper-doll.js';

export function drawPaperDollTop(context, topId, frameWidth = 192, frameHeight = 256) {
  const top = getPaperDollTop(topId);
  if (!top) {
    throw new RangeError(`Unknown paper-doll top: ${topId}`);
  }

  context.save();
  context.scale(frameWidth / 192, frameHeight / 256);
  context.beginPath();
  context.moveTo(77, 134);
  context.lineTo(86, 129);
  context.lineTo(93, 134);
  context.lineTo(99, 138);
  context.lineTo(106, 134);
  context.lineTo(115, 130);
  context.lineTo(124, 137);
  context.lineTo(117, 147);
  context.lineTo(114, 143);
  context.lineTo(115, 165);
  context.quadraticCurveTo(98, 171, 80, 165);
  context.lineTo(81, 144);
  context.lineTo(77, 148);
  context.lineTo(70, 141);
  context.closePath();
  context.fillStyle = top.color;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = top.shade;
  context.stroke();

  context.beginPath();
  context.moveTo(91, 135);
  context.lineTo(99, 141);
  context.lineTo(107, 135);
  context.lineTo(104, 147);
  context.lineTo(95, 147);
  context.closePath();
  context.fillStyle = top.shade;
  context.fill();
  context.restore();
}
