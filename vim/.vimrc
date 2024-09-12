" global config

set number
set nocompatible
set showmode
set showcmd
set mouse=a
set encoding=utf-8
set t_Co=256
set autoindent
set tabstop=4
set shiftwidth=4
set expandtab
set softtabstop=4
set wrap
set linebreak
set laststatus=2
set showmatch
set hlsearch
set incsearch
set smartcase
set nobackup
set undofile
set autochdir
set noerrorbells
set history=1000
set autoread
" set background=dark
filetype indent on
syntax on

set termguicolors
let g:tokyonight_style = 'night'
let g:tokyonight_enable_italic = 1
colorscheme tokyonight

" file template
autocmd BufNewFile *.tex call InsertLatexTemplate()

function! InsertLatexTemplate()
  call setline(1, '\documentclass{article}')
  call setline(2, '\begin{document}')
  call setline(3,'')
  call cursor(3, 1)
  startinsert
  call setline(4, '\end{document}')
endfunction

autocmd BufNewFile *.c call SetCFileTemplate()

function! SetCFileTemplate()
  call setline(1, [
  \   "/*",
  \   " * Filename: " . expand("%:t"),
  \   " * Author: Akira",
  \   " * Description: ",
  \   " */",
  \   "",
  \   "#include <stdio.h>",
  \   "",
  \   "int main() {",
  \   "    ",
  \   "    return 0;",
  \   "}",
  \   ""
  \ ])

  call cursor(10, col('$'))
  startinsert
  call cursor(10, col('$')+1)

endfunction

autocmd BufNewFile *.cpp,*.cc call SetCPPFileTemplate()

function! SetCPPFileTemplate()
  call setline(1, [
  \   "/*",
  \   " * Filename: " . expand("%:t"),
  \   " * Author: Akira",
  \   " * Description: ",
  \   " */",
  \   "",
  \   "#include <iostream>",
  \   "",
  \   "int main() {",
  \   "    ",
  \   "    return 0;",
  \   "}",
  \   ""
  \ ])

  call cursor(10, col('$'))
  startinsert
  call cursor(10, col('$')+1)

endfunction

autocmd BufNewFile *.h,*.hpp call InsertCppHeaderTemplate()

function! InsertCppHeaderTemplate()
  let l:filename = toupper(substitute(expand("%:t"), '\.', '_', 'g'))

  call setline(1, [
        \ '/*',
        \ ' * Filename: ' . expand('%:t'),
        \ ' * Author: Akira',
        \ ' * Description: ',
        \ ' */',
        \ '',
        \ '#ifndef ' . l:filename,
        \ '#define ' . l:filename,
        \ '',
        \ '',
        \ '',
        \ '#endif /* ' . l:filename . ' */'
        \ ])

  call cursor(10, col('$'))
  startinsert
  call cursor(10, col('$'))

endfunction

autocmd BufNewFile *.md call InsertMarkdownTemplate()

function! InsertMarkdownTemplate()
  let l:filename = substitute(expand('%:t'), '\.md$', '', '')

  call setline(1, '# ' . l:filename)
  call append(1, '')

  call cursor(2, col('$'))

  startinsert
endfunction

" have Vim jump to the last position when
if has("autocmd")
  au BufReadPost * if line("'\"") > 1 && line("'\"") <= line("$") | exe "normal! g'\"" | endif
endif

" nerdtree config
" 启动 vim 时自动打开 NERDTree(带参数时不打开)
autocmd vimenter * if argc() == 0 | NERDTree | endif

" 只剩 NERDTree 窗口时关闭 vim
autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif

" 开启/关闭 NERDTree 快捷键
nnoremap <C-T> :NERDTreeToggle<CR>

" 定义窗口位置及窗口大小
let NERDTreeWinPos='left'
let NERDTreeWinSize=25

" 定义切换窗口的快捷键
nnoremap <C-J> <C-W><C-J>
nnoremap <C-K> <C-W><C-K>
nnoremap <C-L> <C-W><C-L>
nnoremap <C-H> <C-W><C-H>

noremap <C-/> :sh<CR>

" 自动编译latex
"augroup TexCompile
"  autocmd!
"  autocmd BufWritePost *.tex silent !xelatex % > /dev/null 2>&1
"augroup END

augroup TexCompile
  autocmd!
  autocmd BufWritePost *.tex call TexCompile()
augroup END

function! TexCompile()
  let output = system('xelatex ' . expand('%'))
  if v:shell_error
    echohl ErrorMsg | echo "Compilation failed!" | echohl None
  endif
endfunction
