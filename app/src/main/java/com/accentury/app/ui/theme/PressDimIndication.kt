package com.accentury.app.ui.theme

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.FocusInteraction
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
 * 손을 떼면 바로 사라진다. 키보드·D-패드 포커스 중에도 같은 덧칠을 그린다 - 옛 ripple이 그리던 포커스 표시 자리다.
 * clickable 포커스는 터치 모드 밖에서만 생겨(Focusability.SystemDefined) 손가락 탭 뒤에는 남지 않는다. 모양을 clip한 요소는 그 모양으로 잘리고, 모양 없는 맨 줄은 [Radius.md]로 둥글린다.
 * 종이가 내려가는 눌림이 있는 버튼은 `indication = null`로 이 덧칠을 받지 않는다. 비활성 clickable은 누름을 내보내지 않아 반응도 없다.
 */
object PressDimIndication : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = PressDimNode(interactionSource)

    override fun hashCode(): Int = -1

    override fun equals(other: Any?): Boolean = other === this
}

private class PressDimNode(private val interactionSource: InteractionSource) : Modifier.Node(), DrawModifierNode {
    private var pressCount = 0
    private var focused = false
    private val dimmed get() = pressCount > 0 || focused

    override fun onAttach() {
        // 눌린 채 떨어졌다 다시 붙으면 Release를 못 받은 수가 남아 덧칠이 걸린다 - 붙을 때마다 새로 센다
        pressCount = 0
        focused = false
        coroutineScope.launch {
            interactionSource.interactions.collect { interaction ->
                val before = dimmed
                when (interaction) {
                    is PressInteraction.Press -> pressCount++
                    is PressInteraction.Release, is PressInteraction.Cancel -> pressCount = (pressCount - 1).coerceAtLeast(0)
                    is FocusInteraction.Focus -> focused = true
                    is FocusInteraction.Unfocus -> focused = false
                }
                if (before != dimmed) invalidateDraw()
            }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        if (dimmed) drawRoundRect(LightPressDim, cornerRadius = CornerRadius(Radius.md.toPx()))
    }
}
