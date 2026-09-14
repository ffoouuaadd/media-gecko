!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var GeckoImage
Var GeckoBitmap
Var GeckoFrame
Var GeckoRunCheck

!macro customFinishPage
  Page custom GeckoFinishCreate GeckoFinishLeave
!macroend

Function GeckoFinishCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  File /oname=$PLUGINSDIR\installer-gecko-00.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-00.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-01.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-01.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-02.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-02.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-03.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-03.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-04.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-04.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-05.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-05.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-06.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-06.bmp"
  File /oname=$PLUGINSDIR\installer-gecko-07.bmp "${BUILD_RESOURCES_DIR}\installer-gecko-07.bmp"

  ${NSD_CreateBitmap} 0 0 164 314 ""
  Pop $GeckoImage
  ${NSD_CreateLabel} 184 34 260 30 "Media Gecko is ready."
  Pop $1
  CreateFont $2 "Segoe UI" 15 700
  SendMessage $1 ${WM_SETFONT} $2 1
  ${NSD_CreateLabel} 184 78 250 42 "Your fast creative asset hub is installed.$\r$\nSearch. Preview. Drag."
  Pop $1
  ${NSD_CreateLabel} 184 132 250 24 "Thanks for building with the Gecko."
  Pop $1
  ${NSD_CreateCheckbox} 184 174 210 18 "Run Media Gecko"
  Pop $GeckoRunCheck
  ${NSD_Check} $GeckoRunCheck

  GetDlgItem $1 $HWNDPARENT 1
  SendMessage $1 ${WM_SETTEXT} 0 "STR:Finish"
  GetDlgItem $1 $HWNDPARENT 3
  EnableWindow $1 0

  StrCpy $GeckoFrame 0
  StrCpy $GeckoBitmap 0
  Call GeckoAnimate
  ${NSD_CreateTimer} GeckoAnimate 125
  nsDialogs::Show
FunctionEnd

Function GeckoAnimate
  ${If} $GeckoBitmap != 0
    System::Call 'gdi32::DeleteObject(p $GeckoBitmap)'
  ${EndIf}
  ${If} $GeckoFrame == 0
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-00.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 1
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-01.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 2
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-02.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 3
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-03.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 4
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-04.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 5
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-05.bmp" $GeckoBitmap
  ${ElseIf} $GeckoFrame == 6
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-06.bmp" $GeckoBitmap
  ${Else}
    ${NSD_SetImage} $GeckoImage "$PLUGINSDIR\installer-gecko-07.bmp" $GeckoBitmap
  ${EndIf}
  IntOp $GeckoFrame $GeckoFrame + 1
  ${If} $GeckoFrame > 7
    StrCpy $GeckoFrame 0
  ${EndIf}
FunctionEnd

Function GeckoFinishLeave
  ${NSD_KillTimer} GeckoAnimate
  ${If} $GeckoBitmap != 0
    System::Call 'gdi32::DeleteObject(p $GeckoBitmap)'
    StrCpy $GeckoBitmap 0
  ${EndIf}
  ${NSD_GetState} $GeckoRunCheck $0
  ${If} $0 == ${BST_CHECKED}
    ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
FunctionEnd
!endif
