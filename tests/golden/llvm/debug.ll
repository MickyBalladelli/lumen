; Lumen LLVM IR
source_filename = "golden-debug.lm"
declare void @llvm.dbg.declare(metadata, metadata, metadata)
define i32 @main() !dbg !7 {
entry:
  ret i32 7, !dbg !8
}
!llvm.dbg.cu = !{!2}
!llvm.module.flags = !{!4, !5}
!0 = !{}
!1 = !DIFile(filename: "golden-debug.lm", directory: ".")
!2 = distinct !DICompileUnit(language: DW_LANG_C_plus_plus, file: !1, producer: "Lumen", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug)
!3 = !DISubroutineType(types: !0)
!4 = !{i32 2, !"Dwarf Version", i32 4}
!5 = !{i32 2, !"Debug Info Version", i32 3}
!6 = !DIExpression()
!7 = distinct !DISubprogram(name: "main", linkageName: "main", scope: !1, file: !1, line: 1, type: !3, scopeLine: 1, spFlags: DISPFlagDefinition, unit: !2, retainedNodes: !0)
!8 = !DILocation(line: 2, column: 3, scope: !7)
