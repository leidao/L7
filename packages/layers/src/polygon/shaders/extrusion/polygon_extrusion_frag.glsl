
in vec4 v_Color;
#pragma include "picking"
out vec4 outputColor;
void main() {

  outputColor = v_Color;
  outputColor = filterColor(outputColor);
}
