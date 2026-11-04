# 中文推理占比实验：统一题目

两组使用完全相同的 prompt，唯一变量是 `@xia-sc/dsh-language-policy` 是否启用。

---

只做分析，不要调用任何工具、不要读取或修改文件：

背景：Windows 11 + nvm-windows。我把 nvm 从 1.1.7 升级到 1.1.12 之后出现三个现象：
1) `nvm use 20.11.1` 输出 `exit status 1: Access is denied.`；
2) `nvm list` 里 20.11.1 显示为已安装，但 `node -v` 仍然是 v18.19.0；
3) `where node` 同时返回 `C:\Program Files\nodejs\node.exe` 和 `C:\Users\<用户名>\AppData\Roaming\nvm\v20.11.1\node.exe`，顺序不确定。

请完成：
A. 按可能性从高到低列出至少 5 个根因，每个根因解释它如何同时解释上面三个现象；
B. 给出每个根因的只读验证命令（Windows PowerShell）；
C. 给出推荐的修复顺序；
D. 最后用不超过 200 字的中文总结。

直接输出分析结果，不要调用任何工具。
