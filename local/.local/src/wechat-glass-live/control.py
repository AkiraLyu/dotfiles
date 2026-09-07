#!/usr/bin/env python3
"""Control the native, live WeChat Glass effect on this KDE installation."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

PACKAGE = Path(__file__).resolve().parent
STATE = Path.home() / '.local/state/wechat-glass-live/state.json'
LEGACY_STATE = Path.home() / '.local/state/wechat-glass/state.json'
EFFECT = 'wechat-glass-live-v4'
OLD_EFFECTS = ['wechat-glass-live-v3', 'wechat-glass-live', 'wechat-glass']
GROUP = 'Effect-wechat-glass-live'
BLUR_GROUP = 'Effect-better-blur-dx'
KEYS = ['Enabled', 'BackgroundOpacity', 'NavigationWidth', 'TitleHeight', 'MatchTolerance', 'CornerRadius']
MISSING = '__WECHAT_GLASS_MISSING__'


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(args))
    return result.stdout.strip()


def dbus(*args):
    return run('qdbus6', 'org.kde.KWin', '/Effects', *args)


def refresh_config():
    # KWin holds a shared kwinrc cache. Applying the configuration reloads it
    # before the native effect reads its KConfigGroup.
    run('qdbus6', 'org.kde.KWin', '/KWin', 'reconfigure')


def read(group, key):
    value = run('kreadconfig6', '--file', 'kwinrc', '--group', group, '--key', key, '--default', MISSING)
    return None if value == MISSING else value


def write(group, key, value):
    args = ['kwriteconfig6', '--file', 'kwinrc', '--group', group, '--key', key]
    args += ['--delete'] if value is None else [str(value)]
    run(*args)


def state():
    if STATE.exists():
        values = json.loads(STATE.read_text())
    else:
        values = {BLUR_GROUP+'/WindowClasses': read(BLUR_GROUP, 'WindowClasses')}
        if LEGACY_STATE.exists():
            old = json.loads(LEGACY_STATE.read_text())
            values[BLUR_GROUP+'/WindowClasses'] = old.get(BLUR_GROUP+'/WindowClasses', values[BLUR_GROUP+'/WindowClasses'])
    for key in KEYS:
        if GROUP+'/'+key not in values:
            values[GROUP+'/'+key] = read(GROUP, key)
    if 'Plugins/'+EFFECT+'Enabled' not in values:
        values['Plugins/'+EFFECT+'Enabled'] = read('Plugins', EFFECT+'Enabled')
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(values, ensure_ascii=False, indent=2)+'\n')
    return values


def clear_class_blur():
    original = state().get(BLUR_GROUP+'/WindowClasses')
    current = (read(BLUR_GROUP, 'WindowClasses') or '').splitlines()
    # The plugin requests blur only for the main window. A class-wide force
    # rule would override that region and blur popup shadows and square corners.
    current = [value for value in current if value != 'wechat']
    value = '\n'.join(current)
    write(BLUR_GROUP, 'WindowClasses', value if value or original is not None else None)
    if dbus('isEffectLoaded', 'better_blur_dx') == 'true':
        dbus('reconfigureEffect', 'better_blur_dx')


def disable_legacy():
    for effect in OLD_EFFECTS:
        if dbus('isEffectLoaded', effect) == 'true':
            # The script prototype needs reconfiguration to undo its roles.
            # Native revisions restore their state in the destructor.
            if effect == 'wechat-glass':
                write('Effect-'+effect, 'Enabled', 'false')
                dbus('reconfigureEffect', effect)
            dbus('unloadEffect', effect)
        write('Plugins', effect+'Enabled', 'false')


def disable():
    state()
    write(GROUP, 'Enabled', 'false')
    if dbus('isEffectLoaded', EFFECT) == 'true':
        dbus('reconfigureEffect', EFFECT)
        dbus('unloadEffect', EFFECT)
    write('Plugins', EFFECT+'Enabled', 'false')
    clear_class_blur()


def enable():
    state()
    disable_legacy()
    if dbus('isEffectLoaded', 'better_blur_dx') != 'true':
        raise RuntimeError('请先启用 Better Blur DX。')
    if EFFECT not in dbus('listOfEffects').splitlines():
        raise RuntimeError('原生插件尚未安装，请执行 control.py install。')
    clear_class_blur()
    write(GROUP, 'Enabled', 'true')
    write('Plugins', EFFECT+'Enabled', 'true')
    try:
        refresh_config()
        if dbus('isEffectLoaded', EFFECT) == 'true':
            dbus('reconfigureEffect', EFFECT)
        elif dbus('loadEffect', EFFECT) != 'true':
            raise RuntimeError('KWin 无法加载插件。KWin 升级后可能需要重新编译。')
        debug = json.loads(dbus('debug', EFFECT, ''))
        if not debug.get('shader_valid') or not debug.get('enabled'):
            raise RuntimeError('透明着色器或特效配置未能启用。')
    except Exception:
        disable()
        raise


def destination():
    return Path(run('qmake6', '-query', 'QT_INSTALL_PLUGINS')) / 'kwin/effects/plugins' / (EFFECT+'.so')


def admin(*args):
    # Only the single compiled library is written with elevated privileges.
    # Configuration, builds, and this Python script run as the desktop user.
    result = subprocess.run(['run0', '--pipe', *map(str, args)])
    if result.returncode:
        raise RuntimeError('系统未授权写入 KWin 原生插件目录；特效保持关闭。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install','enable','disable','status','opacity','uninstall'])
    parser.add_argument('value', nargs='?', type=float)
    parser.add_argument('--build-dir', type=Path, default=PACKAGE/'build',
                        help='构建目录；默认为源码目录下的 build。')
    args = parser.parse_args()
    if args.action == 'install':
        source = args.build_dir.resolve() / 'plugins/kwin/effects/plugins' / (EFFECT+'.so')
        if not source.is_file():
            raise RuntimeError('缺少编译好的插件，请先按 README 执行 CMake 构建。')
        state()
        disable_legacy()
        disable()
        target = destination()
        if not target.exists() or source.read_bytes() != target.read_bytes():
            admin('/usr/bin/sh', '-c',
                  'set -eu; /usr/bin/install -m 755 -- "$1" "$2"; '
                  'shift 2; for old do if [ -f "$old" ]; then /usr/bin/rm -- "$old"; fi; done',
                  'wechat-glass-install', source, target,
                  *(target.with_name(old+'.so') for old in OLD_EFFECTS if old != 'wechat-glass'))
        enable()
        print('微信局部透明实时版本已安装并启用。')
    elif args.action == 'enable':
        enable()
        print('微信局部透明实时版本已启用。')
    elif args.action == 'disable':
        disable()
        print('微信局部透明已关闭。')
    elif args.action == 'opacity':
        if args.value is None or not 0.1 <= args.value <= 1:
            parser.error('opacity 需要 0.1 到 1.0 之间的数值。')
        state()
        write(GROUP, 'BackgroundOpacity', args.value)
        if dbus('isEffectLoaded', EFFECT) == 'true':
            refresh_config()
            dbus('reconfigureEffect', EFFECT)
        print('栏背景不透明度：', args.value)
    elif args.action == 'uninstall':
        original = state()
        disable()
        target = destination()
        if target.exists():
            admin('/usr/bin/rm', '--', target)
        for compound, value in original.items():
            group, key = compound.split('/', 1)
            if group != BLUR_GROUP:
                write(group, key, value)
        STATE.unlink(missing_ok=True)
        print('实时特效已卸载，专属配置已恢复。')
    else:
        loaded = dbus('isEffectLoaded', EFFECT) == 'true'
        result = {
            'loaded': loaded,
            'load_at_login': read('Plugins', EFFECT+'Enabled') == 'true',
            'legacy_loaded': any(dbus('isEffectLoaded', effect) == 'true' for effect in OLD_EFFECTS),
            'background_opacity': float(read(GROUP,'BackgroundOpacity') or '0.52'),
            'force_blur_for_wechat': 'wechat' in (read(BLUR_GROUP,'WindowClasses') or '').splitlines(),
        }
        if loaded:
            result['renderer'] = json.loads(dbus('debug', EFFECT, ''))
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
