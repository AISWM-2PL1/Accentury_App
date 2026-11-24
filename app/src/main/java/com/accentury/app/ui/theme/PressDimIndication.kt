package com.accentury.app.ui.theme

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import kotlinx.coroutines.launch

/**
 * 누르는 동안 요소 위에 검정 5%를 얹는다 (KAN-367, 웹 `--color-press-dim` `:active`와 짝). 물결·퍼짐 없이
 * 손을 떼면 바로 사라진다. 모양을 clip한 요소는 그 모양으로 잘리고, 모양 없는 맨 줄은 [Radius.md]로 둥글린다.
 * 종이가 내려가는 눌림이 있는 버튼은 `indication = null`로 이 덧칠을 받지 않는다. 비활성 clickable은 누름을 내보내지 않아 반응도 없다.
 */
object PressDimIndication : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = PressDimNode(interactionSource)

    override fun hashCode(): Int = -1

    override fun equals(other: Any?): Boolean = other === this
}

private class PressDimNode(private val interactionSource: InteractionSource) : Modifier.Node(), DrawModifierNode {
    private var pressCount = 0

    override fun onAttach() {
        coroutineScope.launch {
            interactionSource.interactions.collect { interaction ->
                val before = pressCount > 0
                when (interaction) {
                    is PressInteraction.Press -> pressCount++
                    is PressInteraction.Release, is PressInteraction.Cancel -> pressCount = (pressCount - 1).coerceAtLeast(0)
                }
                if (before != pressCount > 0) invalidateDraw()
            }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        if (pressCount > 0) drawRoundRect(LightPressDim, cornerRadius = CornerRadius(Radius.md.toPx()))
    }
}
